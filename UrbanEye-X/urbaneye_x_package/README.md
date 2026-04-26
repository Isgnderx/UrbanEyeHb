# UrbanEye-X: Geospatial Knowledge Distillation

## Overview
This repository contains the pipeline for **UrbanEye-X**, a geospatial deep learning framework designed for building extraction from VHR (Very High Resolution) satellite imagery. It utilizes a 3-phase knowledge distillation process to compress a large SegFormer-B5 ensemble into an efficient TinyViT student model for on-orbit deployment.

## Repository Structure
- `geo_mae.py`: Masked Autoencoder for geospatial pre-training.
- `distillation.py`: Core Knowledge Distillation trainer and QAT logic.
- `bit_trans.py` & `sar_drn_encoder.py`: Encoder modules for multi-modal processing.
- `losses/`: Custom loss functions including Lovász-Softmax.

## Quick Start
1. Install dependencies: `pip install -r requirements.txt`
2. Prepare SpaceNet data in `/content/spacenet/`.
3. Run the training script to begin distillation.

## Deployment Target
- NVIDIA Orin NX (INT8 Optimized via TensorRT)
