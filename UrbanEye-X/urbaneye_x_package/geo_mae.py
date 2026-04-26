"""
UrbanEye-X — GeoMAE: Masked Autoencoder for Geospatial Pre-training
Pre-trains a ViT backbone on unlabeled VHR satellite imagery (4-channel: R,G,B,NIR).
mask_ratio=0.75 forces the encoder to develop long-range structural reasoning,
critical for irregular urban morphologies in the Global South.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple


class PatchEmbedding(nn.Module):
    """
    Spatial-spectral patch embedding supporting arbitrary input channel count.
    Converts [B, C_in, H, W] → [B, num_patches, embed_dim] token sequence.
    """

    def __init__(
        self,
        img_size: int = 224,
        patch_size: int = 16,
        in_channels: int = 4,  # R, G, B, NIR
        embed_dim: int = 768,
    ):
        super().__init__()
        self.patch_size = patch_size
        self.num_patches = (img_size // patch_size) ** 2
        self.proj = nn.Conv2d(
            in_channels, embed_dim, kernel_size=patch_size, stride=patch_size
        )
        self.norm = nn.LayerNorm(embed_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.proj(x)                        # [B, D, H/P, W/P]
        x = x.flatten(2).transpose(1, 2)        # [B, N, D]
        return self.norm(x)


class ViTBlock(nn.Module):
    """Standard ViT transformer block: LayerNorm → MHSA → LayerNorm → MLP."""

    def __init__(self, dim: int, num_heads: int, mlp_ratio: float = 4.0):
        super().__init__()
        self.norm1 = nn.LayerNorm(dim)
        self.attn = nn.MultiheadAttention(dim, num_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(dim)
        mlp_dim = int(dim * mlp_ratio)
        self.mlp = nn.Sequential(
            nn.Linear(dim, mlp_dim),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(mlp_dim, dim),
            nn.Dropout(0.1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.norm1(x)
        attn_out, _ = self.attn(h, h, h)
        x = x + attn_out
        x = x + self.mlp(self.norm2(x))
        return x


class MAEEncoder(nn.Module):
    """ViT-Base encoder: processes only visible (unmasked) patches."""

    def __init__(
        self,
        img_size: int = 224,
        patch_size: int = 16,
        in_channels: int = 4,
        embed_dim: int = 768,
        depth: int = 12,
        num_heads: int = 12,
    ):
        super().__init__()
        self.patch_embed = PatchEmbedding(img_size, patch_size, in_channels, embed_dim)
        self.num_patches = self.patch_embed.num_patches
        self.out_channels = embed_dim

        self.cls_token = nn.Parameter(torch.zeros(1, 1, embed_dim))
        self.pos_embed = nn.Parameter(
            torch.zeros(1, self.num_patches + 1, embed_dim)
        )
        self.blocks = nn.ModuleList(
            [ViTBlock(embed_dim, num_heads) for _ in range(depth)]
        )
        self.norm = nn.LayerNorm(embed_dim)
        self._init_weights()

    def _init_weights(self):
        nn.init.trunc_normal_(self.pos_embed, std=0.02)
        nn.init.trunc_normal_(self.cls_token, std=0.02)

    def forward(self, x_visible: torch.Tensor, ids_keep: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x_visible: [B, N_visible, D] — only unmasked patch tokens
            ids_keep: [B, N_visible] — indices of kept patches (for pos embed)
        Returns:
            latent: [B, N_visible+1, D]
        """
        B = x_visible.shape[0]

        # Add positional embeddings for visible patches only
        pos = self.pos_embed[:, 1:, :].expand(B, -1, -1)
        pos_visible = torch.gather(
            pos, 1, ids_keep.unsqueeze(-1).expand(-1, -1, pos.shape[-1])
        )
        x = x_visible + pos_visible

        # Prepend CLS token
        cls = self.cls_token + self.pos_embed[:, :1, :]
        x = torch.cat([cls.expand(B, -1, -1), x], dim=1)

        for block in self.blocks:
            x = block(x)
        return self.norm(x)


class MAEDecoder(nn.Module):
    """
    Lightweight ViT decoder (512-dim).
    Processes ALL patch positions (visible + mask tokens) to reconstruct pixels.
    """

    def __init__(
        self,
        num_patches: int,
        encoder_dim: int = 768,
        decoder_dim: int = 512,
        depth: int = 8,
        num_heads: int = 16,
    ):
        super().__init__()
        self.decoder_embed = nn.Linear(encoder_dim, decoder_dim)
        self.mask_token = nn.Parameter(torch.zeros(1, 1, decoder_dim))
        self.pos_embed = nn.Parameter(torch.zeros(1, num_patches + 1, decoder_dim))
        self.blocks = nn.ModuleList(
            [ViTBlock(decoder_dim, num_heads) for _ in range(depth)]
        )
        self.norm = nn.LayerNorm(decoder_dim)
        self.embed_dim = decoder_dim

        nn.init.trunc_normal_(self.mask_token, std=0.02)
        nn.init.trunc_normal_(self.pos_embed, std=0.02)

    def forward(
        self, latent: torch.Tensor, ids_restore: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            latent: [B, N_visible+1, D_enc] — encoder output
            ids_restore: [B, N] — indices to restore full patch order
        Returns:
            decoded: [B, N, D_dec] — all patch positions
        """
        x = self.decoder_embed(latent)
        B = x.shape[0]

        # Insert mask tokens at masked positions
        mask_tokens = self.mask_token.expand(
            B, ids_restore.shape[1] - (x.shape[1] - 1), -1
        )
        x_no_cls = torch.cat([x[:, 1:, :], mask_tokens], dim=1)  # remove CLS

        # Unshuffle: restore original patch order
        x_restored = torch.gather(
            x_no_cls, 1,
            ids_restore.unsqueeze(-1).expand(-1, -1, x.shape[-1])
        )
        x_restored = x_restored + self.pos_embed[:, 1:, :]

        # Prepend CLS and run decoder
        x_full = torch.cat([x[:, :1, :] + self.pos_embed[:, :1, :], x_restored], dim=1)
        for block in self.blocks:
            x_full = block(x_full)

        return self.norm(x_full[:, 1:, :])  # Remove CLS, return patch tokens


class GeoMAE(nn.Module):
    """
    Masked Autoencoder for Geospatial Pre-training.

    Pre-trains on unlabeled VHR tiles. After pre-training, the encoder is
    used to initialize downstream UrbanEye segmentation/CD backbones.

    mask_ratio=0.75 — each forward pass hides 75% of patches; encoder must
    develop long-range structural reasoning from visible context.

    Training:
        optimizer = AdamW(model.parameters(), lr=1.5e-4, weight_decay=0.05)
        scheduler = CosineAnnealingLR(optimizer, T_max=800)
        # 800 epochs on 500K+ unlabeled Global South tiles
    """

    def __init__(
        self,
        img_size: int = 224,
        patch_size: int = 16,
        in_channels: int = 4,
        encoder_dim: int = 768,
        encoder_depth: int = 12,
        encoder_heads: int = 12,
        decoder_dim: int = 512,
        decoder_depth: int = 8,
        decoder_heads: int = 16,
        mask_ratio: float = 0.75,
        norm_pix_loss: bool = True,
    ):
        super().__init__()
        self.patch_size = patch_size
        self.in_channels = in_channels
        self.mask_ratio = mask_ratio
        self.norm_pix_loss = norm_pix_loss

        self.encoder = MAEEncoder(
            img_size, patch_size, in_channels, encoder_dim, encoder_depth, encoder_heads
        )
        num_patches = self.encoder.num_patches
        self.decoder = MAEDecoder(
            num_patches, encoder_dim, decoder_dim, decoder_depth, decoder_heads
        )
        # Reconstruction head: tokens → pixel values
        self.pixel_head = nn.Linear(
            decoder_dim, patch_size * patch_size * in_channels, bias=True
        )

    def random_masking(
        self, x: torch.Tensor, mask_ratio: float
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Uniform random patch masking.
        Returns:
            x_masked: [B, N_keep, D] — visible patches
            mask: [B, N] — binary mask (1=masked, 0=visible)
            ids_restore: [B, N] — indices to restore original order
        """
        B, N, D = x.shape
        len_keep = int(N * (1 - mask_ratio))

        noise = torch.rand(B, N, device=x.device)
        ids_shuffle = torch.argsort(noise, dim=1)
        ids_restore = torch.argsort(ids_shuffle, dim=1)

        ids_keep = ids_shuffle[:, :len_keep]
        x_masked = torch.gather(x, 1, ids_keep.unsqueeze(-1).expand(-1, -1, D))

        mask = torch.ones(B, N, device=x.device)
        mask[:, :len_keep] = 0.0
        mask = torch.gather(mask, 1, ids_restore)

        return x_masked, mask, ids_restore, ids_keep

    def patchify(self, imgs: torch.Tensor) -> torch.Tensor:
        """[B, C, H, W] → [B, N, P*P*C] patch sequences (reconstruction targets)."""
        B, C, H, W = imgs.shape
        P = self.patch_size
        h, w = H // P, W // P
        x = imgs.reshape(B, C, h, P, w, P)
        x = x.permute(0, 2, 4, 1, 3, 5).reshape(B, h * w, C * P * P)
        return x

    def forward(self, imgs: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, float]:
        """
        Args:
            imgs: [B, C_in, H, W] — multi-spectral satellite tiles
        Returns:
            loss: scalar MAE reconstruction loss
            pred: [B, N, P*P*C] — reconstructed patch pixels
            mask_ratio: fraction of patches masked (for logging)
        """
        # Embed patches
        tokens = self.encoder.patch_embed(imgs)  # [B, N, D]

        # Mask
        tokens_vis, mask, ids_restore, ids_keep = self.random_masking(
            tokens, self.mask_ratio
        )

        # Encode visible patches
        latent = self.encoder(tokens_vis, ids_keep)

        # Decode all positions
        decoded = self.decoder(latent, ids_restore)

        # Reconstruct pixels
        pred = self.pixel_head(decoded)  # [B, N, P*P*C]

        # Reconstruction target
        target = self.patchify(imgs)

        if self.norm_pix_loss:
            # Normalize target per patch (improves representation quality)
            mean = target.mean(dim=-1, keepdim=True)
            var = target.var(dim=-1, keepdim=True)
            target = (target - mean) / (var + 1e-6).sqrt()

        # MSE loss on masked patches only
        loss_per_patch = ((pred - target) ** 2).mean(dim=-1)  # [B, N]
        loss = (loss_per_patch * mask).sum() / mask.sum()

        return loss, pred, self.mask_ratio
