"""
UrbanEye-X — Knowledge Distillation Pipeline
Teacher: SegFormer-B5 ensemble (3×82M params)
Student: TinyViT-21M → INT8 QAT → TensorRT deployment

3-Phase distillation:
  Phase 1: Feature-level L2 matching (intermediate representations)
  Phase 2: Logit-level KL divergence (soft label transfer, T=4)
  Phase 3: QAT — Quantization-Aware Training with INT8 constraints
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Tuple, Optional


class GeoAIDistillationTrainer(nn.Module):
    """
    Progressive Knowledge Distillation for on-orbit UrbanEye-X deployment.

    Args:
        teacher_ensemble: list of 3 SegFormer-B5 models (frozen during distillation)
        student_model:    TinyViT-21M model to be trained
        temperature:      KD softmax temperature (default 4.0 per Hinton et al.)
        lambda1:          weight for hard label loss (Lovász)
        lambda2:          weight for soft KL divergence loss
        lambda3:          weight for intermediate feature matching loss
    """

    def __init__(
        self,
        teacher_ensemble: List[nn.Module],
        student_model: nn.Module,
        temperature: float = 4.0,
        lambda1: float = 0.50,
        lambda2: float = 0.30,
        lambda3: float = 0.20,
        teacher_feat_dims: List[int] = (512, 640, 768),
        student_feat_dims: List[int] = (128, 160, 192),
    ):
        super().__init__()
        self.teachers = nn.ModuleList(teacher_ensemble)
        self.student = student_model
        self.T = temperature
        self.lambda1 = lambda1
        self.lambda2 = lambda2
        self.lambda3 = lambda3

        # Freeze all teacher parameters
        for teacher in self.teachers:
            for param in teacher.parameters():
                param.requires_grad = False

        # Feature projection heads: teacher dim → student dim
        self.proj_heads = nn.ModuleList([
            nn.Sequential(
                nn.Conv2d(t_dim, s_dim, kernel_size=1, bias=False),
                nn.BatchNorm2d(s_dim),
            )
            for t_dim, s_dim in zip(teacher_feat_dims, student_feat_dims)
        ])

    def forward(
        self, images: torch.Tensor, gt_masks: torch.Tensor
    ) -> Tuple[torch.Tensor, dict]:
        """
        Args:
            images:   [B, C, H, W] input imagery
            gt_masks: [B, H, W] integer ground-truth segmentation labels
        Returns:
            total_loss: scalar distillation loss
            loss_dict:  component losses for logging
        """
        # ── Teacher Forward (no gradient) ────────────────────────────────
        with torch.no_grad():
            teacher_logits_list, teacher_features_list = [], []
            for teacher in self.teachers:
                logits, features = teacher(images, return_intermediate=True)
                teacher_logits_list.append(logits)
                teacher_features_list.append(features)

            # Ensemble soft labels (temperature-scaled)
            teacher_logits_avg = torch.stack(teacher_logits_list).mean(0)
            soft_labels = F.softmax(teacher_logits_avg / self.T, dim=1)

            # Ensemble intermediate features (averaged per stage)
            teacher_feat_avg = [
                torch.stack([tf[s] for tf in teacher_features_list]).mean(0)
                for s in range(len(teacher_features_list[0]))
            ]

        # ── Student Forward ───────────────────────────────────────────────
        student_logits, student_features = self.student(
            images, return_intermediate=True
        )

        # ── Loss 1: Hard Label (Lovász-Softmax) ──────────────────────────
        from losses.composite_loss import lovasz_softmax
        L_hard = lovasz_softmax(F.softmax(student_logits, dim=1), gt_masks)

        # ── Loss 2: Soft Label KL Divergence ─────────────────────────────
        student_log_soft = F.log_softmax(student_logits / self.T, dim=1)
        L_kd = F.kl_div(
            student_log_soft,
            soft_labels,
            reduction="batchmean",
            log_target=False,
        )
        L_kd *= self.T ** 2  # Re-scale gradient magnitude (Hinton et al., 2015)

        # ── Loss 3: Feature-Level Matching ───────────────────────────────
        L_feat = torch.tensor(0.0, device=images.device)
        for i, (t_feat, s_feat, proj) in enumerate(
            zip(teacher_feat_avg, student_features, self.proj_heads)
        ):
            t_proj = proj(t_feat)
            # Normalize before L2 matching (avoids scale sensitivity)
            t_norm = F.normalize(t_proj.flatten(2), dim=1)
            s_norm = F.normalize(s_feat.flatten(2), dim=1)
            L_feat = L_feat + (t_norm - s_norm).pow(2).mean()

        # ── Total Loss ────────────────────────────────────────────────────
        L_total = (
            self.lambda1 * L_hard
            + self.lambda2 * L_kd
            + self.lambda3 * L_feat
        )

        loss_dict = {
            "L_hard": L_hard.item(),
            "L_kd": L_kd.item(),
            "L_feat": L_feat.item(),
            "L_total": L_total.item(),
        }

        return L_total, loss_dict


class DomainAdaptiveLayerNorm(nn.Module):
    """
    Adapts normalization statistics to target domain (Global South morphologies).
    Learnable per-domain scale/shift conditioned on a domain embedding.
    Used when transferring from SpaceNet (US/Asia) to new city domains.
    """

    def __init__(self, normalized_shape: int, num_domains: int = 8):
        super().__init__()
        self.ln = nn.LayerNorm(normalized_shape)
        self.domain_gamma = nn.Embedding(num_domains, normalized_shape)
        self.domain_beta = nn.Embedding(num_domains, normalized_shape)

        # Initialize to identity transformation
        nn.init.ones_(self.domain_gamma.weight)
        nn.init.zeros_(self.domain_beta.weight)

    def forward(self, x: torch.Tensor, domain_id: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x:         [B, N, C] feature tokens
            domain_id: [B] integer domain indices (e.g. 0=Lagos, 1=Dhaka, ...)
        Returns:
            x_adapted: [B, N, C] domain-normalized features
        """
        x_norm = self.ln(x)
        gamma = self.domain_gamma(domain_id).unsqueeze(1)  # [B, 1, C]
        beta = self.domain_beta(domain_id).unsqueeze(1)
        return gamma * x_norm + beta


def apply_lora_to_encoder(
    model: nn.Module,
    r: int = 8,
    lora_alpha: float = 16.0,
    dropout: float = 0.05,
    target_modules: List[str] = ("q_proj", "v_proj"),
) -> nn.Module:
    """
    Apply Low-Rank Adaptation (LoRA) to attention projections.
    Enables rapid domain adaptation with only 5-20 labeled target samples.
    Only ~0.1% of parameters are updated; backbone stays frozen.

    Args:
        model:          Pre-trained encoder (e.g., GeoMAE-pretrained ViT)
        r:              LoRA rank (default 8)
        lora_alpha:     Scaling factor (default 16)
        dropout:        LoRA dropout (default 0.05)
        target_modules: Which projection layers to adapt

    Returns:
        model with LoRA adapters injected and base weights frozen
    """
    try:
        from peft import LoraConfig, get_peft_model, TaskType

        config = LoraConfig(
            r=r,
            lora_alpha=lora_alpha,
            target_modules=list(target_modules),
            lora_dropout=dropout,
            bias="none",
            task_type=TaskType.FEATURE_EXTRACTION,
        )
        model = get_peft_model(model, config)
        model.print_trainable_parameters()
        return model

    except ImportError:
        print(
            "Warning: peft not installed. Falling back to manual LoRA injection. "
            "Install with: pip install peft"
        )
        return _manual_lora_injection(model, r, lora_alpha, dropout, target_modules)


class LoRALinear(nn.Module):
    """Manual LoRA injection for environments without the peft library."""

    def __init__(
        self,
        base_layer: nn.Linear,
        r: int = 8,
        lora_alpha: float = 16.0,
        dropout: float = 0.05,
    ):
        super().__init__()
        self.base = base_layer
        self.r = r
        self.scale = lora_alpha / r
        in_features = base_layer.in_features
        out_features = base_layer.out_features

        self.lora_A = nn.Parameter(torch.randn(r, in_features) * 0.01)
        self.lora_B = nn.Parameter(torch.zeros(out_features, r))
        self.dropout = nn.Dropout(dropout)

        # Freeze base layer
        for param in self.base.parameters():
            param.requires_grad = False

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        base_out = self.base(x)
        lora_out = self.dropout(x) @ self.lora_A.T @ self.lora_B.T
        return base_out + lora_out * self.scale


def _manual_lora_injection(
    model: nn.Module,
    r: int,
    lora_alpha: float,
    dropout: float,
    target_modules: List[str],
) -> nn.Module:
    """Inject LoRALinear wrappers in-place for target module names."""
    for name, module in model.named_modules():
        for target in target_modules:
            if name.endswith(target) and isinstance(module, nn.Linear):
                parent_name = ".".join(name.split(".")[:-1])
                attr_name = name.split(".")[-1]
                parent = model
                for part in parent_name.split("."):
                    if part:
                        parent = getattr(parent, part)
                setattr(parent, attr_name, LoRALinear(module, r, lora_alpha, dropout))
    return model


def apply_qat(student_model: nn.Module) -> nn.Module:
    """
    Post-distillation Quantization-Aware Training for NVIDIA Orin NX INT8 deployment.
    Fuses Conv-BN-ReLU sequences, inserts fake quantization nodes.
    After QAT, export with export_to_onnx() for TensorRT conversion.
    """
    student_model.qconfig = torch.ao.quantization.get_default_qat_qconfig("fbgemm")

    # Fuse Conv-BN-ReLU for quantization efficiency
    try:
        torch.ao.quantization.fuse_modules(
            student_model,
            [["conv1", "bn1", "relu"]],
            inplace=True,
        )
    except Exception:
        pass  # Module names vary by architecture — manual fusion may be needed

    model_qat = torch.ao.quantization.prepare_qat(student_model, inplace=False)
    return model_qat


def export_to_onnx(
    model: nn.Module,
    save_path: str = "urbaneye_student_int8.onnx",
    input_shape: Tuple[int, ...] = (1, 4, 512, 512),
) -> None:
    """
    Export INT8 quantized student model to ONNX for TensorRT conversion.
    Target: NVIDIA Orin NX, 10W power mode.
    """
    model.eval()
    dummy_input = torch.randn(*input_shape)

    torch.onnx.export(
        model,
        dummy_input,
        save_path,
        opset_version=17,
        input_names=["input"],
        output_names=["change_logits"],
        dynamic_axes={
            "input": {0: "batch", 2: "height", 3: "width"},
            "change_logits": {0: "batch"},
        },
        do_constant_folding=True,
    )
    print(f"ONNX model saved to: {save_path}")
    print("Next step: trtexec --onnx=urbaneye_student_int8.onnx --int8 --saveEngine=urbaneye.trt")
