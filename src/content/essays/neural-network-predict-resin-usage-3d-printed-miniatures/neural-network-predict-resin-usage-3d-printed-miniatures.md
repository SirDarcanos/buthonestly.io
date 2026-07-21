---
title: How I Built a 3D Print Cost Calculator with a Neural Network
date: 2025-11-27T02:00:09
updated: 2025-12-09T10:49:01
sticky: false
cornerstone: false
excerpt: A tiny dense neural network learned resin consumption well enough to replace hours of manual slicing in my 3D printing business.
categories:
  - Programming
tags:
  - AI
  - Automation
  - Creativity
  - Productivity
  - Python
coverAlt: A child in glasses and a yellow shirt leans over a tabletop game, moving small miniature figures while holding a card.
downloads:
  - file: dense-models-3d-print-cost-calculator.zip
    label: 3D-print cost calculator models
cover: 3d-printing-cost-calculator-dense-network.jpg
coverCaption:
---

> [!summary]- Quick Summary
>
> - I built a 3D print cost calculator by combining PrusaSlicer, UVtools, and mesh features into a tabular dataset.
> - The original model was a small dense network per artist; the new version is an ensemble of a dense model plus XGBoost.
> - A RandomForest trained on past hyperparameter searches helped shrink the search space and produce a more stable dense model.
> - The ensemble now achieves roughly 98% of predictions within 3 grams and 99% within 5 grams of true resin usage.
> - The MiniRes library, `stl-scanner.py`, and a small pricing script let you go from STL files to cost-per-miniature in a few commands.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

For a long time, my 3D printing cost calculator was… me.

When I was running Elemental Beacon, my tiny resin miniature business, each month followed the same pattern.  
Three artists dropped new packs of 3D printing models. Each pack meant dozens of beautiful miniatures I wanted to print and sell.

And every single file came with the same important question: **How much resin does this actually use?**

If you run a printing business, you live and die by unsexy 3D printing facts like that. Resin is not cheap. Failed prints add up. Your margin lives in the gap between what you _think_ a model costs you and what it _really_ costs once you factor in resin consumption, failure rates, and print times.

If you’ve never worked with it, what is resin material in this context? It’s a liquid photopolymer you pour into a vat. UV light hardens it layer by layer. The detail is incredible, which is why it’s perfect for miniatures—but every gram is more expensive than filament. “Close enough” adds up fast.

So my life looked like this:

- Open slicer.
- Load STL.
- Slice.
- Read the numbers.
- Copy them into a spreadsheet.
- Next file.

That was my “automation.” That was my 3D printing efficiency strategy.

Meanwhile I was slowly learning Python and playing with neural networks. After one too many afternoons sacrificed to mindless slicing, a new question showed up:

> **“Could I turn this into business automation with AI, and teach a small model how to calculate resin for me?”**

That question turned into an experiment. The experiment turned into a tool. The tool turned into something I relied on every month.

## When Geometry Failed the “How to Calculate Resin Costs” Test

My first idea was to skip slicers entirely.

If an STL file is just a mesh, surely I could figure out how to calculate resin directly from geometry. So I grabbed the Python library `numpy-stl` and started poking at the files. For each model I pulled out basic stats like volume and surface area and tried to turn those into a formula.

On paper it looked neat: more volume → more material → more cost.

Reality shrugged.

Two 3D printing models with almost identical volume could end up using extremely diverse amounts of resin once sliced. The slicer cared about all the messy details volume didn’t know about:

- wall thickness
- hollow interiors
- supports inside and outside the model
- orientation on the build plate

Geometry knew the shape. It did not know the print.

Slicing software like Chitubox and Lychee _did_ understand the print. They knew how layers stack, how supports interact, and how much resin would actually end up on the plate. But they lived behind clicky interfaces.

They were great for turning 3D printing models into physical objects and terrible at being part of a pipeline. No clean way to tell them, “Here’s a folder of a hundred files; tell me how much resin to use for each of them.”

So I had code that understood meshes, slicers that understood printing, and a growing pile of models that all needed numbers.

If I wanted trustworthy estimates of resin consumption, I was still stuck slicing every file by hand.

![A laptop displays a 3D animated male character being edited in Blender, placed next to a potted succulent.](3d-modeling.jpg 'Photo by <a href="https://www.pexels.com/@jakeheinemann/">Jake Heinemann</a> on <a href="https://www.pexels.com/">Pexels.com</a>')

## PrusaSlicer, UVtools, and a Real Data Pipeline

The breakthrough came from two tools that actually wanted to be scripted: [PrusaSlicer](https://prusaslicer.net/) and [UVtools](https://github.com/sn4k3/UVtools).

PrusaSlicer is built for FDM printers and filament, not resin. On paper, it wasn’t meant for what I was doing. But it has a command-line interface. I could call it from Python, pass it an STL, and tell it to slice the file with a consistent profile.

UVtools lives on the resin side. It opens sliced resin files, inspects them, and pulls out all the interesting details: total volume, resin consumption in grams, estimated print time, and more. It also has a command-line interface.

Together, they became my little assembly line:

1.  PrusaSlicer sliced each STL from the artists, generating printer-ready files in batch.
2.  UVtools read those sliced files and extracted the real slicing stats, especially how much resin the print would use.
3.  A Python script glued everything together, calling both tools via CLI and parsing the outputs into a single, consistent dataset.

Now, instead of sitting in front of a slicer, I could point my script at a folder and say:

“Here, go figure out how much resin to use for all of these.”

I ran this pipeline on models from the three artists I worked with at the time. Each had their style—multipart heroes, giant monsters, intricate display pieces—and that variety turned out to matter a lot for how supports behaved and where the resin actually went.

By the end, I had well over ten thousand sliced parts and models, each with geometry and real-world resin usage attached.

That’s the moment when it stopped being a toy project and started to look like the basis for a genuine **3D printing cost calculator**.

## Turning Slicer Output into Model-Friendly Data

Once the pipeline worked, I could finally stop guessing.

For each sliced file, I kept:

- geometry from the original STL (volume, surface area, implied mass), and
- the stats UVtools extracted from the PrusaSlicer output, especially resin usage in grams.

On top of the raw numbers, I built a few simple engineered features that seemed useful for 3D printing facts: ratios between surface and volume and a combined volume–mass interaction term that roughly captured “how much stuff is really there.”

A tiny slice of the dataset looked like this:

|     | kb    | volume  | surface\_area | bbox\_area | euler\_number | scale | weight | surface\_volume\_ratio |
| --- | ----- | ------- | ------------- | ---------- | ------------- | ----- | ------ | ---------------------- |
| 0   | 57773 | 26671.5 | 62721.7       | 208020.7   | 4579          | 103.7 | 26.9   | 2.4                    |
| 1   | 3795  | 279.4   | 1028.6        | 1739.4     | 149           | 21.0  | 0.2    | 3.7                    |
| 2   | 20591 | 12494.2 | 27990.7       | 67514.9    | 3264          | 80.3  | 11.7   | 2.2                    |
| 3   | 30708 | 6960.5  | 22507.6       | 64423.3    | 3855          | 70.6  | 6.2    | 3.2                    |
| 4   | 26519 | 3515.4  | 8609.0        | 20061.8    | 1412          | 47.1  | 3.6    | 2.4                    |

Here `weight` is the important part: UVtools’ estimate of how much resin to use for a given slice.

That number became the target for the model. All the other columns became hints.

Because each artist had a pretty distinct sculpting style and way of structuring models, I didn’t treat this as one big

## Why a Dense Neural Network Was Only the First Step

The first time around, I went with a classic dense neural network: a small feedforward Keras model that takes a handful of features (the data from the table above) and predicts resin usage in grams. No convolutions, no attention, no clever architecture—just normalized tabular inputs, a few dense layers, and one regression output. I built three separate models, one for each artist.

The interesting part was not the shape of the network but how to size it just right. For each artist, I used Bayesian optimization to search over. We talked before about this type of [[building-convolutional-neural-network-python-tensorflow|optimization for CNNs]].

The goal was simple: minimize validation error on resin consumption without building something so large it became fragile or annoying to maintain.

All three models ended up small, well under 250k parameters, and fast to train. They were, in a very literal sense, tiny.

### Bayesian Optimization Parameters Grid

| Component             | Search Range                                                           | Purpose                                                             |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Initial Layer Width   | 32 → 1024 (step 32)                                                    | Controls initial projection capacity from normalized inputs.        |
| Hidden Layers (Count) | 1 → 8                                                                  | Defines network depth; trades off expressiveness and overfitting.   |
| Hidden Layer Width    | 32 → 1024 (step 32)                                                    | Adjusts model capacity per layer to fit data complexity.            |
| Activations           | `relu`, `leaky_relu`, `elu`, `tanh`, `selu`, `linear`, `swish`, `mish` | Allows different nonlinearities for pattern learning and stability. |
| Batch Normalization   | Enabled / Disabled; Before / After Activation                          | Stabilizes gradients and smooths learning dynamics.                 |
| Dropout               | 0.0 → 0.75 (step 0.05)                                                 | Reduces overfitting and improves generalization.                    |
| Regularization        | None, L1, L2, or Both (1e−6 → 1e−2)                                    | Encourages sparsity or weight decay for better generalization.      |
| Optimizer             | `adam`, `adamw`, `nadam`, `adamax`, `rmsprop`, `sgd`                   | Tunes gradient updates for different convergence behaviors.         |
| Learning Rate         | 1e−6 → 1e−2 (log scale)                                                | Controls stability and convergence speed.                           |

This setup produced good results. Errors were usually within a couple of grams, and for day-to-day pricing that was already enough to be useful.

But when I came back to the project in 2025 while writing this essay, a few things bothered me:

- I had one model per artist instead of one model I could ship and reuse.
- The hyperparameter space was wide and fuzzy; tuning was expensive and hard to reason about.
- Dense networks are great, but for tabular regression you can often squeeze more signal out of tree-based models.

So I decided to treat the original work as version 1, keep the dataset, and see how far I could push it with a cleaner pipeline and a more opinionated approach to the model.

## Revisiting the Project: From Dense Network to Ensemble

When I picked up the project again, the first surprise was that the original dataset was still intact in an old database. In the first version of this essay I wrote that I had lost the dataset. Imagine how happy I was when I was able to find it! Once I exported it, cleaned a few quirks, and recomputed some features, I had a solid foundation to build on.

I wanted three things:

1.  A single model instead of one per artist.
2.  Better interpretability around which features and hyperparameters actually mattered.
3.  A small, robust package I could publish and support without babysitting.

The new version, I called it MiniRes, does that by combining two models:

- an improved dense neural network
- an XGBoost regressor trained on the same features

Their predictions are combined into an ensemble, which tends to be more stable and slightly more accurate than either model on its own. The code and training notebooks live in the [`minires-models` repository on GitHub](https://github.com/SirDarcanos/minires-models/), and the weights are published as a [Hugging Face model at `nicolamustone/minires`](https://huggingface.co/nicolamustone/minires).

Under the hood, MiniRes works like this:

- takes the tabular features exported from your STL analysis and slicing pipeline
- normalizes the inputs and feeds them to both models
- averages their predictions (with tuned weights) to produce a final resin usage estimate in grams

The ensemble is small enough to run comfortably on a laptop (I trained and worked on the model exclusively on my MacBook Pro) but strong enough to track the slicer’s estimates very closely.

### Using a RandomForest to Shrink the Hyperparameter Space

Before retraining everything, I wanted to understand which parts of the old hyperparameter search actually mattered.

Every Bayesian optimization run had left behind a dataset of its own: one row per trial, with columns like `hidden_layers`, `first_layer_width`, `dropout`, `learning_rate`, and the resulting validation error.

Instead of staring at those tables by hand, I treated them as a new regression problem:

- inputs: hyperparameters
- target: validation RMSE

I trained a RandomForest regressor on this “meta-dataset” and used its feature importances to see which knobs really moved the needle and which ones mostly added noise.

A few patterns emerged:

- Optimizer learning rate was the most important hyperparameter to narrow down.
- Beyond a certain depth, adding more layers didn’t buy much accuracy; it only increased variance.
- The width of the first layer mattered more than most subtle regularization tweaks.
- Dropout had a sweet spot; anything beyond that made the model wobblier than it needed to be.
- Activations and optimizer choice were important, but only within relatively narrow bands.

Armed with that, I shrank the hyperparameter space:

- set the number of layers to either 2 or 3
- restricted layer widths to the ranges that actually helped
- pinned regularization and dropout to a couple of sensible defaults
- cut the optimizer and activation list down to the few that consistently performed well

Then I re-ran a smaller, more focused search with this constrained space. The result was a denser cluster of “good” models, easier to reproduce and less sensitive to small noise in the data.

That cleaner dense model became half of the ensemble. The other half, XGBoost, brought the usual tree-based strengths: non-linear interactions, robustness to mild outliers, and very good performance on tabular data.

## How Accurate Is MiniRes Now?

The revised model is trained on all artists at once and evaluated against UVtools’ resin usage in grams. On the held-out test set, the ensemble reaches:

- Percentage of predictions within 1 gram of the true value: 91.66%
- Percentage within 2 grams: 97.02%
- Percentage within 3 grams: 98.31%
- Percentage within 5 grams: 99.33%

With overall regression metrics:

- RMSE: 1.5779 grams
- MAE: 0.3835 grams
- R²: 0.99585
- Adjusted R²: 0.99583

In plain language:

- If you care about being within 1 gram for each miniature, you will be right roughly nine times out of ten.
- If you allow an error margin of 2–3 grams, you are almost always in range.
- At 5 grams, mistakes are rare enough that they barely register. This will most likely happen with very big miniatures because the dataset did not have many of them to train my model on.

For pricing, I recommend thinking in terms of an error margin you are comfortable with rather than chasing “perfect” predictions.

My preference is a 2-gram margin:

- precise enough that per-miniature costs are trustworthy
- conservative enough that small underestimates do not meaningfully eat into your profit

You can always be stricter if your margins are razor thin or looser if you care more about rough planning than exact cents.

In business terms, that’s the difference between “kind of useful” and “go ahead and use this for real decisions.” A couple of grams of resin is usually just a few cents. For pricing and planning, that’s close enough.

## MiniRes: Library, Model, and STL Scanner

At a high level, MiniRes works like this:

1.  You use a small CLI script to scan STL files and extract geometric features into a CSV.
2.  You load that CSV in Python.
3.  You create a MiniRes model instance.
4.  You call `.predict(...)` to get resin usage in grams for each row.

### Installation

Install the dependencies of Minires:

```bash
pip install tensorflow xgboost pandas numpy huggingface_hub
```

Then import MiniRes in your project:

```python
from minires import minires
```

### Basic Usage

A minimal example:

```python
import pandas as pd
from minires import minires

# 1. Load STL features (see stl-scanner below)
df = pd.read_csv("stl_features.csv")

# 2. Create the ensemble model
model = minires()  # downloads weights from Hugging Face on first run

# 3. Predict resin usage in grams
y_pred = model.predict(df)

print(y_pred[:10])
```

MiniRes requires a very specific set of features to work. You can inspect them at runtime:

```python
model = minires()
print(model.features)
```

Your dataframe must contain at least those columns. Extra columns are ignored; missing required ones will trigger a clear error.

### Preparing a Dataset with `stl-scanner.py`

To avoid writing your own geometry pipeline, the Hugging Face repo includes a helper script called `stl-scanner.py`. It uses `trimesh` to scan STL files and export geometric features into a CSV that MiniRes can use directly.

Make sure you install `trimesh` if you don’t have it already:

```bash
pip install trimesh
```

The script accepts:

- `--stl_path`
  - either a single `.stl` file or a folder of `.stl` files (non-recursive)
  - defaults to the current directory if omitted
- `--output_path`
  - folder where the resulting CSV is written
  - defaults to the current directory

Typical usage:

```bash
# Scan all STLs in the current folder
python stl-scanner.py

# Scan a single file
python stl-scanner.py --stl_path /path/to/model.stl --output_path ./out

# Scan all STLs in a folder (non-recursive)
python stl-scanner.py --stl_path /path/to/stls --output_path ./features
```

After this, you will have a `stl_features.csv` file in the output folder with one row per STL. That CSV is ready to be passed to MiniRes.

## A Small Pricing Script for Resin and Overhead

Once you can predict resin usage in grams, turning that into cost is mostly bookkeeping.

Pricing a miniature usually includes at least:

- resin cost (grams × cost per gram)
- per-miniature overhead (your time, electricity, failures, packaging, accounting, etc.)

You can handle that with a simple script that sits next to `stl-scanner.py`. Create a new Python file (or download the one at the end of this essay), adjust the constants at the top, run it after scanning, and it writes a CSV you can open in your spreadsheet tool.

```python
from pathlib import Path

import pandas as pd
from minires import minires

# ==== Edit these numbers for your context ====
RESIN_COST_PER_GRAM = 0.06   # in your currency, e.g. 0.06 = €0.06/gram
OVERHEAD_PER_MINI = 1.50     # fixed overhead per miniature (packaging, time, etc.)
INPUT_CSV = Path("stl_features.csv")
OUTPUT_CSV = Path("mini_pricing.csv")
# =============================================

def main() -> None:
    if not INPUT_CSV.exists():
        raise SystemExit(f"Input CSV not found: {INPUT_CSV}. "
                         "Run stl-scanner.py first.")

    # Load STL features produced by stl-scanner.py
    df = pd.read_csv(INPUT_CSV)

    # Create MiniRes ensemble model
    model = minires(verbose=0)

    # Predict resin usage in grams
    grams = model.predict(df)

    df["predicted_grams"] = grams
    df["resin_cost"] = df["predicted_grams"] * RESIN_COST_PER_GRAM
    df["overhead"] = OVERHEAD_PER_MINI
    df["total_cost"] = df["resin_cost"] + df["overhead"]

    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Wrote pricing table to {OUTPUT_CSV.resolve()}")

if __name__ == "__main__":
    main()
```

A typical workflow looks like this:

1.  Drop your STLs into a folder.
2.  Run `stl-scanner.py` on the folder to generate `stl_features.csv`.
3.  Adjust `RESIN_COST_PER_GRAM` and `OVERHEAD_PER_MINI` in the script (you’ll likely do this only once, or when your costs change).
4.  Run the script to produce `mini_pricing.csv`.
5.  Open that file in your spreadsheet or import it into your storefront system.

At that point you have per-model resin usage, resin cost, and total cost (resin + overhead) for every miniature in the pack. Add your profit margin on top of that and you have the retail price.

## What Changed in My Day-to-Day Printing

Before the model, every new release followed the same script:

- Download the files.
- Open a slicer.
- Slice each model.
- Read how much resin it needs.
- Copy that into a spreadsheet.
- Only then start thinking about pricing, stock, and print schedules.

It was the opposite of **3D printing efficiency**.

After the model, the workflow looked more like this:

- Download the files.
- Run MiniRes.
- Get a table with estimated resin usage for every model.
- Use those numbers directly for pricing, resin ordering, and planning.

I still used a resin slicer for test prints, edge cases, and maybe once a quarter to update my dataset and retrain the model with more miniatures (all still automated via terminal). The point wasn’t to eliminate slicing completely. The point was to stop doing it _hundreds of times_ just to get ballpark cost estimates.

MiniRes turned into a quiet piece of business automation with AI:

- It never appeared on the storefront.
- It didn’t talk to customers.
- It just answered “how much resin to use?” for each model, well enough that I could make decisions without losing a weekend to clicking through a UI.

That was enough to feel like a superpower.

## Small AI Is Still AI

Looking back, this project changed how I think about “AI projects” in general.

It didn’t require cutting-edge research. There were no giant models, no GPU clusters, and no viral demos. Just STLs from a few artists, PrusaSlicer and UVtools on the command line, a homemade dataset, and a tiny model that learned to behave like a 3D printing cost calculator.

The important pieces weren’t magical. They were practical:

- Features that actually reflected the physics of what is resin material doing in a print.
- A dataset built from real slices, not theory.
- A model small enough that retraining it when new packs arrived didn’t feel like an event.

And the payoff wasn’t dramatic. It was quieter than that: more reliable margins, faster pricing, better 3D printing efficiency, and fewer evenings lost to repetitive slicing.

If you’ve ever built a little script or spreadsheet to avoid doing the same thing twice, you already know the feeling. This was just that, with a dense neural network in the middle.

The question that started it all is still the one I come back to whenever some part of my work feels like busywork:

> Is there a small piece of business automation with AI that could take this off my hands?

In this case, the answer happened to be a tiny model that knows how to calculate resin faster than I can at the end of a long day.

If you want to download the models and use them yourself, you can find them in the **Downloads** section below.
