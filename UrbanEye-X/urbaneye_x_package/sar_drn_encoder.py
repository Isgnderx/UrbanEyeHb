"""
UrbanEye-X — SAR-DRN Integrated Encoder
Despeckling is learned end-to-end w.r.t. segmentation loss.
EdgePreservingGate restores structural edge gradients after despeckling.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class EdgePreservingGate(nn.Module):
    """
    Soft gate that suppresses despeckling at structural boundary pixels.
    Uses learnable Sobel-initialized derivative filters to compute gradient
    magnitude, then applies a sigmoid gate around a threshold.
    gate=1 → preserve original SAR signal (edge zone)
    gate=0 → allow full despeckling (homogeneous zone)
    """

    def __init__(self, threshold: float = 0.15, sharpness: float = 50.0):
        super().__init__()
        self.threshold = threshold
        self.sharpness = sharpness
        self.edge_detector = nn.Conv2d(1, 2, kernel_size=3, padding=1, bias=False)
        self._init_sobel_weights()

    def _init_sobel_weights(self):
        sobel_x = torch.tensor(
            [[-1.0, 0.0, 1.0], [-2.0, 0.0, 2.0], [-1.0, 0.0, 1.0]]
        )
        sobel_y = torch.tensor(
            [[-1.0, -2.0, -1.0], [0.0, 0.0, 0.0], [1.0, 2.0, 1.0]]
        )
        with torch.no_grad():
            self.edge_detector.weight[0, 0] = sobel_x
            self.edge_detector.weight[1, 0] = sobel_y

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: SAR amplitude [B, 1, H, W]
        Returns:
            gate: [B, 1, H, W] in [0, 1] — 1=preserve edge, 0=despeckle
        """
        grads = self.edge_detector(x)
        grad_magnitude = torch.sqrt(grads[:, 0:1] ** 2 + grads[:, 1:2] ** 2 + 1e-8)
        gate = torch.sigmoid(self.sharpness * (grad_magnitude - self.threshold))
        return gate


class SARDespeckleNet(nn.Module):
    """
    DnCNN-style residual despeckling network.
    Predicts the speckle residual (noise estimate), not the clean image directly.
    clean_estimate = input - residual
    """

    def __init__(self, channels: int = 64, num_layers: int = 20):
        super().__init__()
        layers = [nn.Conv2d(1, channels, 3, padding=1), nn.ReLU(inplace=True)]
        for _ in range(num_layers - 2):
            layers += [
                nn.Conv2d(channels, channels, 3, padding=1),
                nn.BatchNorm2d(channels),
                nn.ReLU(inplace=True),
            ]
        layers.append(nn.Conv2d(channels, 1, 3, padding=1))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Returns speckle residual, same shape as input."""
        return self.net(x)


class SARDRNEncoder(nn.Module):
    """
    Integrated Despeckling + Segmentation Encoder.

    Pipeline:
        SAR amplitude
            → DespeckleNet (residual)
            → despeckled = input - residual
            → EdgePreservingGate (blend)
            → processed SAR (edges preserved, smooth regions despeckled)
            → base segmentation encoder

    The gradient from the segmentation loss backpropagates through the gate
    into the DespeckleNet, teaching it to preserve edges useful for segmentation.
    """

    def __init__(
        self,
        base_encoder: nn.Module,
        drn_channels: int = 64,
        drn_layers: int = 20,
        edge_threshold: float = 0.15,
    ):
        super().__init__()
        self.drn = SARDespeckleNet(drn_channels, drn_layers)
        self.edge_gate = EdgePreservingGate(threshold=edge_threshold)
        self.encoder = base_encoder

    def forward(self, sar_amplitude: torch.Tensor):
        """
        Args:
            sar_amplitude: [B, 1, H, W] — log-scaled SAR amplitude
        Returns:
            features: encoder feature maps (multi-scale dict or tensor)
            speckle_residual: [B, 1, H, W] — for auxiliary DRN loss
        """
        speckle_residual = self.drn(sar_amplitude)
        despeckled = sar_amplitude - speckle_residual
        edge_mask = self.edge_gate(sar_amplitude)

        # Blend: despeckle homogeneous zones, preserve edges
        sar_processed = (1.0 - edge_mask) * despeckled + edge_mask * sar_amplitude

        features = self.encoder(sar_processed)
        return features, speckle_residual
