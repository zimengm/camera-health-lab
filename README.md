# Camera Health Lab

This repository contains code for fingertip photoplethysmography, medical-image transfer learning, and live screen-camera BFSK communication.

## Results

- Part 1: fingertip signal analysis and figures are in the accompanying PDF. Raw fingertip video and biometric time series remain local.
- Part 2: ImageNet-pretrained MobileNetV2 on PneumoniaMNIST-64. Validation accuracy 95.04%; held-out test accuracy 87.02%; test ROC AUC 0.9681. The notebook is actually executed, including classifier training and backbone fine-tuning.
- Part 3: 24 physical live-phone trials at 20/40/80/120 cm, alpha differences 0.1/0.5, and raw rates 2/2.5/4 bit/s. Payload errors: 1/960; including preamble: 7/1536. Full definitions and limitations are in the report and measured result tables.

Project repository: https://github.com/zimengm/camera-health-lab

Executed Colab notebook: https://colab.research.google.com/github/zimengm/camera-health-lab/blob/main/notebooks/part2_medical_finetuning.ipynb

This GitHub-backed Colab link requires the notebook to be present on the repository main branch. The downloadable notebook is also included under `notebooks/`.

## Run the transmitter

Use Python 3.10 or 3.11 for a new environment. Install analysis dependencies:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

```sh
python src/serve.py
```

On the computer open `http://localhost:8000/batch.html`. Host `src/phone-receiver/dist/` over HTTPS for phone camera access; camera images stay on-device. The provided private hosted receiver requires the owner's sign-in; its source works independently of Sites hosting.

## Analyze measured screen-camera experiments

```sh
python src/analyze_batch.py data/part3/batch/20cm/receiver.json data/part3/batch/20cm/transmitter.json
python src/summarize_experiments.py
```

The included screen-camera exports omit browser device/group identifiers. They contain averaged screen brightness, timing, and decoded packets. Per-condition results are in `results/part3/batch/`. Shared human flicker observations assume fixed observer position, screen brightness and room lighting; they are not independent observations for each phone distance.

## Heart-rate analysis

```sh
python src/part1_heart_rate.py /path/to/your/fingertip_video.mov
```

## Medical-image notebook

Open `notebooks/part2_medical_finetuning.ipynb` in Colab. It downloads the public dataset with checksum verification, preserves official splits, trains a frozen-backbone classifier, fine-tunes the final backbone layers, selects by validation loss and evaluates the held-out test split. ROC and t-SNE are included. For local training install `requirements-training.txt`. Local execution used TensorFlow 2.16.2 and Python 3.9.6; exact package versions are recorded in `results/part2/environment.json`.

## Software checks

Install Node.js 18 or later for the JavaScript checks; Python checks use the analysis environment above.

```sh
node src/phone-receiver/verify_decoder.cjs
node src/phone-receiver/verify_capture.cjs
node src/phone-receiver/verify_batch.cjs
python src/verify_pipeline.py
```

Synthetic checks are not substitutes for physical measurements. At only one 40-bit payload per condition, low measured BER does not establish a reliability trend. Carriers are fixed at 4/10 Hz; the rate sweep does not establish a precise perceptual threshold. Medical-image results are educational and do not establish clinical performance.

## Contents excluded

Raw fingertip/screen video, personal biometric time series, downloaded image datasets, model-weight caches, credentials, browser device identifiers and private hosting identity are excluded. The PDF report is supplied separately for submission. No fabricated model or communication results are included.
