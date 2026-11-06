"""Post-selection error review; no training, threshold tuning or model selection."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.metrics import roc_auc_score


def wilson(correct, total):
    z = 1.959963984540054
    p = correct / total
    denom = 1 + z*z/total
    center = (p + z*z/(2*total))/denom
    radius = z*np.sqrt(p*(1-p)/total + z*z/(4*total*total))/denom
    return [float(center-radius), float(center+radius)]


def review(images, truth, probability, out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    truth = np.asarray(truth).reshape(-1)
    probability = np.asarray(probability).reshape(-1)
    assert len(images) == len(truth) == len(probability)
    assert set(np.unique(truth)) == {0, 1} and np.isfinite(probability).all()
    pred = probability >= .5
    tn = int(np.sum((truth == 0) & ~pred)); fp = int(np.sum((truth == 0) & pred))
    fn = int(np.sum((truth == 1) & ~pred)); tp = int(np.sum((truth == 1) & pred))
    metrics = {}
    for name, correct, total in [('accuracy', tn+tp, len(truth)),
                                  ('pneumonia_sensitivity', tp, tp+fn),
                                  ('normal_specificity', tn, tn+fp),
                                  ('pneumonia_precision', tp, tp+fp),
                                  ('normal_recall', tn, tn+fp)]:
        metrics[name] = {'estimate': correct/total, 'ci95_wilson': wilson(correct, total),
                         'correct': correct, 'total': total}
    # Stratification preserves the official test class counts in each resample.
    rng = np.random.default_rng(2026)
    groups = [np.flatnonzero(truth == c) for c in (0, 1)]
    aucs = []
    for _ in range(2000):
        idx = np.concatenate([rng.choice(g, len(g), replace=True) for g in groups])
        aucs.append(roc_auc_score(truth[idx], probability[idx]))
    metrics['roc_auc'] = {'estimate': float(roc_auc_score(truth, probability)),
                          'ci95_stratified_bootstrap': np.quantile(aucs, [.025, .975]).tolist(),
                          'resamples': 2000, 'seed': 2026}
    result = {'scope': 'Post-hoc descriptive analysis of the unchanged selected model at threshold 0.5.',
              'metrics': metrics, 'confusion_matrix': [[tn, fp], [fn, tp]],
              'majority_class_test_accuracy': float(np.mean(truth == 1)),
              'interval_limitation': 'Image-level intervals assume independent test images. Patient grouping and external validity are not established; AUC bootstrap conditions on class counts.',
              'error_example_selection': 'Four most confidently wrong examples per error type; test split indices are zero based.',
              'examples': []}
    fig, axes = plt.subplots(2, 4, figsize=(10, 6))
    for row, (mask, title, reverse) in enumerate([
            ((truth == 0) & pred, 'Normal → pneumonia', True),
            ((truth == 1) & ~pred, 'Pneumonia → normal', False)]):
        idx = np.flatnonzero(mask)
        order = np.argsort(probability[idx], kind='stable')
        if reverse: order = order[::-1]
        selected = idx[order[:4]]
        for col, ax in enumerate(axes[row]):
            ax.axis('off')
            if col >= len(selected): continue
            i = int(selected[col]); ax.imshow(images[i].squeeze(), cmap='gray')
            ax.set_title(f'Test #{i} · P(pneumonia)={probability[i]:.3f}', fontsize=9)
            result['examples'].append({'test_index': i, 'true_label': int(truth[i]),
                                       'prediction': int(pred[i]), 'pneumonia_probability': float(probability[i])})
        axes[row, 0].text(-.08, .5, title, transform=axes[row, 0].transAxes,
                          rotation=90, ha='right', va='center', fontsize=10)
    fig.suptitle('Most confidently wrong test examples (fixed threshold 0.5)', fontsize=13)
    fig.tight_layout(rect=(.025, 0, 1, .94)); fig.savefig(out/'error_examples.png', dpi=180)
    plt.close(fig)
    (out/'error_analysis.json').write_text(json.dumps(result, indent=2))
    lines = ['# Error review and uncertainty', '',
             'The model and 0.5 decision threshold are unchanged. These analyses were performed after selection; test errors were not used to retrain or choose a threshold.', '',
             '| Metric | Estimate | 95% interval |', '|---|---:|---:|']
    for name, value in metrics.items():
        interval = value.get('ci95_wilson', value.get('ci95_stratified_bootstrap'))
        lines.append(f"| {name} | {value['estimate']:.4f} | {interval[0]:.4f}–{interval[1]:.4f} |")
    lines += ['', f'The majority-class test baseline is {result["majority_class_test_accuracy"]:.2%}. '
              f'There are {fp} false positives among {tn+fp} normal images and {fn} false negatives among {tp+fn} pneumonia images. '
              'High pneumonia sensitivity therefore coexists with substantially lower normal specificity.', '',
              'The montage deliberately shows the four most confidently wrong examples in each direction. '
              'It demonstrates failures rather than diagnosing their causes. The validation/test gap could reflect split differences or model generalization; these data do not isolate a cause.', '',
              result['interval_limitation']]
    (out/'error_analysis.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps(result['metrics'], indent=2))
    return result


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    dataset = root/'data/part2/medmnist/pneumoniamnist_64.npz'
    if not dataset.exists():
        raise SystemExit('Run the medical-image notebook first to download its dataset, or run the included post-hoc notebook cell.')
    with np.load(dataset) as data, np.load(root/'results/part2/test_predictions.npz') as scores:
        assert np.array_equal(data['test_labels'].reshape(-1), scores['labels'])
        review(data['test_images'], scores['labels'], scores['probabilities'], root/'results/part2')
