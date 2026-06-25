# FaceUp — ML training pipeline (Phase 3)

Train our own emotion classifiers on FER2013, remapped to the app's 5 classes
(`happy, sad, angry, surprised, neutral`). Trained weights land in
`ml/artifacts/` and are loaded by the app's inference engines.

## 1. Get the dataset

Put FER2013 at `data/fer2013/` (override with `FACEUP_DATA_ROOT`). **Either** layout works:

- `data/fer2013/fer2013.csv` — the classic CSV (`emotion, pixels, Usage`), **or**
- image folders: `data/fer2013/train/<class>/*.jpg` and `data/fer2013/test/<class>/*.jpg`
  where `<class>` ∈ {angry, disgust, fear, happy, sad, surprise, neutral}.

Sources: Kaggle `msambare/fer2013` (image folders) or any `fer2013.csv` mirror.
The `data/` folder is git-ignored (the dataset is large).

## 2. Train

```bash
python -m ml.train --model softmax --epochs 20          # Topic 7 baseline
python -m ml.train --model cnn --epochs 30              # Topic 8 centerpiece (Keras .fit)
python -m ml.train --model cnn --loop gradtape --epochs 15   # Topic 8: tf.GradientTape loop
```

Outputs: `ml/artifacts/<model>.keras`, `<model>_meta.json`, `<model>_curves.png`.

> On this machine TF runs on **CPU** (native Windows has no GPU support in TF
> 2.18). The small CNN trains fine on CPU; for speed use Google Colab GPU or
> WSL2 and copy the `.keras` file back into `ml/artifacts/`.

## 3. Evaluate

```bash
python -m ml.evaluate --model cnn
```

Prints accuracy + per-class report and writes `ml/artifacts/<model>_confusion.png`.

## Where each course topic lives

| Topic | File |
|---|---|
| 6 — NumPy / tensors / dtypes | `preprocessing.py`, `data.py` |
| 7 — preprocessing, encoding, split, softmax regression | `preprocessing.py`, `models.build_softmax`, `evaluate.py` |
| 8 — CNN, Keras, ReLU/softmax, `tf.GradientTape` | `models.build_cnn`, `train.py` |
