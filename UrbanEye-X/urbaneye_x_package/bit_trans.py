"""
UrbanEye-X — Bi-Temporal Feature Correlation Transformer (Bit-Trans)
Bi-directional cross-attention between T1/T2 feature maps for change detection.
Outperforms Siamese subtraction/concatenation by learning global token correspondence
robust to sub-pixel co-registration residuals.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple


class CrossAttentionBlock(nn.Module):
    """
    Cross-attention between two feature maps (query from one, key/value from other).
    Each T2 token attends to ALL T1 tokens — captures long-range change context.
    """

    def __init__(self, embed_dim: int, num_heads: int = 8, dropout: float = 0.1):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim = embed_dim // num_heads
        self.scale = self.head_dim ** -0.5

        self.q_proj = nn.Linear(embed_dim, embed_dim)
        self.k_proj = nn.Linear(embed_dim, embed_dim)
        self.v_proj = nn.Linear(embed_dim, embed_dim)
        self.out_proj = nn.Linear(embed_dim, embed_dim)
        self.dropout = nn.Dropout(dropout)
        self.norm = nn.LayerNorm(embed_dim)

    def forward(
        self, query: torch.Tensor, context: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            query:   [B, N, C] — queries (e.g. T2 features)
            context: [B, N, C] — keys/values (e.g. T1 features)
        Returns:
            attended: [B, N, C]
        """
        B, N, C = query.shape

        Q = self.q_proj(query).view(B, N, self.num_heads, self.head_dim).transpose(1, 2)
        K = self.k_proj(context).view(B, N, self.num_heads, self.head_dim).transpose(1, 2)
        V = self.v_proj(context).view(B, N, self.num_heads, self.head_dim).transpose(1, 2)

        attn = torch.matmul(Q, K.transpose(-2, -1)) * self.scale
        attn = F.softmax(attn, dim=-1)
        attn = self.dropout(attn)

        out = torch.matmul(attn, V)
        out = out.transpose(1, 2).contiguous().view(B, N, C)
        out = self.out_proj(out)

        # Residual connection
        return self.norm(query + out)


class BitTransBlock(nn.Module):
    """
    One Bit-Trans encoder block: bidirectional cross-attention + MLP.
    A_T2→T1: T2 queries T1 (what changed from past to present?)
    A_T1→T2: T1 queries T2 (what was present that is now gone?)
    """

    def __init__(self, embed_dim: int, num_heads: int = 8, mlp_ratio: float = 4.0):
        super().__init__()
        self.cross_t2_t1 = CrossAttentionBlock(embed_dim, num_heads)
        self.cross_t1_t2 = CrossAttentionBlock(embed_dim, num_heads)

        mlp_dim = int(embed_dim * mlp_ratio)
        self.mlp = nn.Sequential(
            nn.LayerNorm(embed_dim * 3),
            nn.Linear(embed_dim * 3, mlp_dim),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(mlp_dim, embed_dim),
        )

    def forward(
        self, f_t1: torch.Tensor, f_t2: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            f_t1: [B, N, C] T1 (reference) feature tokens
            f_t2: [B, N, C] T2 (query) feature tokens
        Returns:
            f_change: [B, N, C] fused change-aware features
        """
        a_t2_t1 = self.cross_t2_t1(query=f_t2, context=f_t1)
        a_t1_t2 = self.cross_t1_t2(query=f_t1, context=f_t2)

        diff = f_t2 - f_t1  # Explicit difference as residual signal
        fused = torch.cat([a_t2_t1, a_t1_t2, diff], dim=-1)  # [B, N, 3C]
        return self.mlp(fused)


class UncertaintyHead(nn.Module):
    """
    Per-pixel aleatoric + epistemic uncertainty via MC Dropout.
    - Aleatoric: inherent data noise (glint, saturation, partial cloud)
    - Epistemic: model uncertainty (reducible with more data)
    Pixels with total_unc > threshold are flagged for human review.
    """

    def __init__(self, in_channels: int, dropout_rate: float = 0.3):
        super().__init__()
        self.dropout = nn.Dropout2d(p=dropout_rate)
        self.conv_mu = nn.Conv2d(in_channels, 1, kernel_size=1)
        self.conv_log_var = nn.Conv2d(in_channels, 1, kernel_size=1)

    def forward(
        self, features: torch.Tensor, mc_samples: int = 20
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Args:
            features: [B, C, H, W]
            mc_samples: number of MC Dropout forward passes
        Returns:
            change_pred: [B, 1, H, W] mean change probability
            epistemic_unc: [B, 1, H, W] variance across MC samples
            aleatoric_unc: [B, 1, H, W] mean predicted variance
        """
        self.train()  # Keep dropout active during inference
        mus, log_vars = [], []

        for _ in range(mc_samples):
            f = self.dropout(features)
            mus.append(self.conv_mu(f))
            log_vars.append(self.conv_log_var(f))

        self.eval()

        mu_stack = torch.stack(mus, dim=0)        # [S, B, 1, H, W]
        lv_stack = torch.stack(log_vars, dim=0)

        epistemic_unc = mu_stack.var(dim=0)
        aleatoric_unc = lv_stack.exp().mean(dim=0)
        change_pred = mu_stack.mean(dim=0).sigmoid()

        return change_pred, epistemic_unc, aleatoric_unc


class BitTrans(nn.Module):
    """
    Bi-Temporal Feature Correlation Transformer — full model.

    Architecture:
        Shared encoder (weight-tied) → T1/T2 feature tokens
        → N × BitTransBlock (bidirectional cross-attention)
        → Change decoder (FPN-style upsampling)
        → UncertaintyHead (MC Dropout)

    Usage:
        model = BitTrans(encoder=my_encoder, embed_dim=256, num_blocks=4)
        change_pred, epistemic, aleatoric = model(img_t1, img_t2)
    """

    def __init__(
        self,
        encoder: nn.Module,
        embed_dim: int = 256,
        num_blocks: int = 4,
        num_heads: int = 8,
        num_classes: int = 2,
        uncertainty_threshold: float = 0.35,
    ):
        super().__init__()
        self.encoder = encoder  # Shared weights for T1 and T2
        self.num_classes = num_classes
        self.uncertainty_threshold = uncertainty_threshold

        # Token projection (encoder output dim → embed_dim)
        self.token_proj = nn.Linear(encoder.out_channels, embed_dim)

        # Bit-Trans encoder blocks
        self.blocks = nn.ModuleList(
            [BitTransBlock(embed_dim, num_heads) for _ in range(num_blocks)]
        )

        # Change segmentation decoder
        self.decoder = nn.Sequential(
            nn.Conv2d(embed_dim, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
        )
        self.seg_head = nn.Conv2d(64, num_classes, kernel_size=1)
        self.uncertainty_head = UncertaintyHead(in_channels=64)

    def _encode_and_tokenize(self, img: torch.Tensor) -> Tuple[torch.Tensor, tuple]:
        """Encode image → flatten spatial dims → project to embed_dim tokens."""
        feat = self.encoder(img)  # [B, C, H', W']
        B, C, H, W = feat.shape
        tokens = feat.flatten(2).transpose(1, 2)  # [B, H'W', C]
        tokens = self.token_proj(tokens)            # [B, H'W', embed_dim]
        return tokens, (B, H, W)

    def forward(
        self, img_t1: torch.Tensor, img_t2: torch.Tensor, mc_samples: int = 20
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Args:
            img_t1: [B, C, H, W] reference (earlier) image
            img_t2: [B, C, H, W] query (later) image
            mc_samples: MC Dropout samples for uncertainty estimation
        Returns:
            change_pred: [B, num_classes, H, W] change probability map
            epistemic_unc: [B, 1, H, W]
            aleatoric_unc: [B, 1, H, W]
        """
        f_t1, (B, fH, fW) = self._encode_and_tokenize(img_t1)
        f_t2, _ = self._encode_and_tokenize(img_t2)

        # Bidirectional cross-attention fusion
        change_tokens = f_t1  # accumulate in T1 space
        for block in self.blocks:
            change_tokens = block(f_t1, f_t2)
            f_t1 = change_tokens  # progressive refinement

        # Reshape tokens → spatial feature map
        change_feat = change_tokens.transpose(1, 2).view(B, -1, fH, fW)

        # Decode to full resolution
        decoded = self.decoder(change_feat)
        decoded_up = F.interpolate(
            decoded, scale_factor=4, mode="bilinear", align_corners=False
        )

        # Segmentation logits
        change_pred = self.seg_head(decoded_up)

        # Uncertainty estimation
        _, epistemic_unc, aleatoric_unc = self.uncertainty_head(
            decoded_up, mc_samples=mc_samples
        )

        return change_pred, epistemic_unc, aleatoric_unc

    def flag_for_review(
        self,
        change_pred: torch.Tensor,
        epistemic_unc: torch.Tensor,
        aleatoric_unc: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Suppress automatic alerts in high-uncertainty regions.
        Returns:
            confident_change: change map with uncertain regions zeroed
            review_mask: pixels requiring human review
        """
        total_unc = epistemic_unc + aleatoric_unc
        high_unc = (total_unc > self.uncertainty_threshold)
        confident_change = change_pred * (~high_unc).float()
        return confident_change, high_unc
