# Part 2: Medical image fine-tuning
We used ImageNet-pretrained MobileNetV2 on PneumoniaMNIST-64 with the official 4,708/524/624 train/validation/test split. Grayscale images were repeated into RGB and resized to 96×96; upsampling cannot recover lost detail. We trained a new classifier at learning rate 0.001, then fine-tuned the final 30 backbone layers (excluding batch normalization) at 0.00001. Training used class weights computed from training data only. Checkpoints were selected by validation loss.

Selected stage: finetuned. Validation accuracy: 0.9504. Test accuracy: 0.8702. Test ROC AUC: 0.9681. Test sensitivity: 0.9667; specificity: 0.7094. Head-only best validation loss: 0.2024; fine-tuned best validation loss: 0.1318.

Limitations include low source image resolution, class imbalance, and evaluation on one benchmark split. These results do not establish clinical diagnostic performance. Patient-level independence has not been independently audited.

Sources: https://medmnist.com/ and https://keras.io/guides/transfer_learning/
