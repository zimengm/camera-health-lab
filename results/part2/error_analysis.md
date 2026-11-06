# Error review and uncertainty

The model and 0.5 decision threshold are unchanged. These analyses were performed after selection; test errors were not used to retrain or choose a threshold.

| Metric | Estimate | 95% interval |
|---|---:|---:|
| accuracy | 0.8702 | 0.8415–0.8943 |
| pneumonia_sensitivity | 0.9667 | 0.9438–0.9804 |
| normal_specificity | 0.7094 | 0.6482–0.7638 |
| pneumonia_precision | 0.8472 | 0.8108–0.8776 |
| normal_recall | 0.7094 | 0.6482–0.7638 |
| roc_auc | 0.9681 | 0.9560–0.9792 |

The majority-class test baseline is 62.50%. There are 68 false positives among 234 normal images and 13 false negatives among 390 pneumonia images. High pneumonia sensitivity therefore coexists with substantially lower normal specificity.

The montage deliberately shows the four most confidently wrong examples in each direction. It demonstrates failures rather than diagnosing their causes. The validation/test gap could reflect split differences or model generalization; these data do not isolate a cause.

Image-level intervals assume independent test images. Patient grouping and external validity are not established; AUC bootstrap conditions on class counts.
