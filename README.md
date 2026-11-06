# Camera Health Lab

This repository contains code for fingertip photoplethysmography, medical-image transfer learning, and live screen-camera BFSK communication.

## Results

- Part 1: fingertip signal analysis and figures are in the accompanying PDF. Raw fingertip video and biometric time series remain local.
- Part 2: ImageNet-pretrained MobileNetV2 on PneumoniaMNIST-64. Validation accuracy 95.04%; held-out test accuracy 87.02%; test ROC AUC 0.9681. The notebook is actually executed, including classifier training and backbone fine-tuning.
- Post-selection error review includes eight confidently wrong examples, Wilson proportion intervals and a 2,000-resample stratified bootstrap AUC interval. Model selection and the 0.5 threshold were unchanged.
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

## Supplemental visibility experiment

Open `http://localhost:8000/refine.html`. The receiver uses the `rate-coupled` profile (`?profile=rate-coupled` on the hosted receiver). Eight shuffled conditions cover alpha differences 0.1/0.5 and raw rates 2/4/6/8 bit/s; each bit contains two or three carrier cycles. Carrier pairs are 4/6, 8/12, 12/18 and 16/24 Hz. The screen and camera must both support these frequencies; the highest condition needs camera sampling above 50 samples/s. One round takes about 182 seconds. Record each observation directly; legacy observations must never be copied to the new profile.

```sh
python src/analyze_refinement.py /path/to/receiver_refinement.json /path/to/refinement_transmitter.json
```

This analysis keeps new measurements separate, counts undelivered packets as erasures when capture coverage is established, and flags timing gaps or undersampling. The 20 cm first run is now measured: seven correct messages and one undelivered packet (6 bit/s, alpha difference 0.1). Effective payload error/erasure rate is 40/320; the seven delivered packets have 0/280 wrong payload bits. All 0.1 settings were slightly visible and all 0.5 settings clearly visible; no imperceptible condition was observed. Results and the preamble-only offline failure diagnostic are under `results/part3/refinement/`.

```sh
node src/phone-receiver/diagnose_sync.cjs data/part3/refinement/20cm_r1/receiver.json data/part3/refinement/20cm_r1/transmitter.json results/part3/refinement/20cm_r1/results.json V0004
```

The offline scan can recover V0004 after alignment, but only 22/24 preamble bits match, below the unchanged live requirement of 23/24. Offline recovery is not substituted for the missing live packet. Both protocols retain one packet per condition; neither establishes an exact visual threshold or reliability ceiling.

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
node src/phone-receiver/verify_refinement.cjs
python src/verify_pipeline.py
python src/verify_refinement_analysis.py
```

Synthetic checks are not substitutes for physical measurements. At only one 40-bit payload per condition, low measured BER does not establish a reliability trend. Carriers are fixed at 4/10 Hz; the rate sweep does not establish a precise perceptual threshold. Medical-image results are educational and do not establish clinical performance.

## Contents excluded

Raw fingertip/screen video, personal biometric time series, downloaded image datasets, model-weight caches, credentials, browser device identifiers and private hosting identity are excluded. The PDF report is supplied separately for submission. No fabricated model or communication results are included.
