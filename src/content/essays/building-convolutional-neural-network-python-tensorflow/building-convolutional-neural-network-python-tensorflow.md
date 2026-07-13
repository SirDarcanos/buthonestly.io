---
title: Building a Convolutional Neural Network in Python with TensorFlow
date: 2025-10-30T02:00:00
updated: 2026-05-12T23:03:51
draft: false
excerpt: Build, train, and tune a CNN in TensorFlow, understanding each layer
  from data prep to Bayesian hyperparameter search.
categories:
  - Programming
tags:
  - AI
  - Automation
  - Creativity
  - Python
coverAlt: Building a Convolutional Neural Network in Python with TensorFlow
originalCover: https://buthonestly.io/wp-content/uploads/2025/11/luis-lara-nucZB1NPpRY-unsplash.jpg
downloads:
  - file: cnn-mnist-use-case-tensorflow.zip
    label: CNN + MNIST notebook
---

What does a CNN actually look like when you build it from scratch?

> [!summary]- Quick Summary
>
> -   You set up a clean TensorFlow + Jupyter environment so the CNN is reproducible instead of fragile.
> -   MNIST is loaded, normalized, reshaped, one hot–encoded, and split into train, validation, and test sets for honest evaluation.
> -   A SimpleCNN class builds the network from composable blocks: Conv → BatchNorm → Activation → Pooling, then Dense → BatchNorm → Activation → Dropout → Softmax.
> -   A small baseline model is trained first, with training/validation curves used to check convergence, overfitting, and generalization.
> -   Bayesian optimization with Keras Tuner searches hyperparameters (filters, L2, learning rate, optimizer, dropout, activation) to find a stronger configuration.
> -   The best model is retrained, evaluated on the test set, and inspected with predictions, a confusion matrix, and a per class classification report.
> -   The core takeaway is understanding how each CNN piece works so you can move beyond MNIST to tougher, real world datasets.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

There’s no better way to understand a convolutional neural network than to create one yourself. Most tutorials rush straight into pre-trained models or copy-paste architectures, but that skips the part that matters: learning how a CNN neural network actually works.

In this guide, we’ll build a complete CNN in TensorFlow for image classification using the MNIST dataset. You’ll see what each block does, how to prepare your data, and how to optimize the network automatically with Bayesian search.

By the end, you’ll have a working convolutional neural network example and a clear understanding of what goes into one.

## Setting Up Your Environment

You can follow this tutorial in any Jupyter Notebook environment that supports Python and TensorFlow, whether it’s local or cloud-based. If you already have everything ready, skip ahead to the next section.

If not, I’ve written a dedicated guide that walks through how to [[set-up-tensorflow-docker-jupyter-notebook|set up a TensorFlow Docker Jupyter environment step by step]].

Once your environment is ready, open Jupyter, create a new notebook, and follow along.  
Each code block in this tutorial should go into its own cell. If anything behaves oddly, restarting the kernel and running all cells again usually fixes it.

## Loading, Exploring, and Preprocessing the Data

Every convolutional neural network starts with data. Images that the model will learn to recognize and classify. In our case, we’ll use the [MNIST dataset](https://en.wikipedia.org/wiki/MNIST_database), a classic benchmark for image classification tasks. MNIST contains 70,000 grayscale images of handwritten digits, each 28×28 pixels. It’s small enough to train quickly, yet rich enough to show how a CNN neural network processes visual data.

The goal in this section is to understand the basics of preparing data for a convolutional neural network: how to load it, inspect it, and apply simple preprocessing steps to make it ready for training.

### Imports

We’ll import all the libraries we’ll need for this tutorial: NumPy for numeric operations, Matplotlib for visualization, TensorFlow and Keras for building and training the CNN neural network, Scikit-learn for splitting data and computing evaluation metrics, and Keras Tuner for the Bayesian optimization we’ll use later.

import os
import random
import numpy as np
import matplotlib.pyplot as plt
import tensorflow as tf

from tensorflow.keras.datasets import mnist
from tensorflow.keras.utils import to\_categorical
from tensorflow.keras import layers, models, optimizers, regularizers

from sklearn.model\_selection import train\_test\_split
from sklearn.metrics import classification\_report, confusion\_matrix, ConfusionMatrixDisplay

from keras\_tuner.tuners import BayesianOptimization

Even though we won’t use all of these imports right away, having them together at the top keeps your notebook organized and ready for the next steps.

### Global Constants

Before loading any data, let’s define a few constants that we’ll use throughout the notebook. Setting them all in one place keeps the code organized and easy to modify later. If you decide to experiment with a different image size or batch size, you’ll only need to change it here once, and the rest of the code will adapt automatically.

One thing worth highlighting is the random seed setup. Neural networks involve randomness, from how data is split to how weights are initialized to how batches are shuffled. By fixing a seed and applying it consistently across Python, NumPy, and TensorFlow, we make sure every run behaves the same.

This helps you debug, compare results, and confirm that improvements come from real changes, not random luck.

\# ====== GLOBAL CONSTANTS ======

# Image dimensions and shape
IMAGE\_HEIGHT = 28
IMAGE\_WIDTH  = 28
IMAGE\_CHANNELS = 1
INPUT\_SHAPE = (IMAGE\_HEIGHT, IMAGE\_WIDTH, IMAGE\_CHANNELS)

# Dataset and model parameters
NUM\_CLASSES   = 10
VAL\_SPLIT     = 0.3        # portion of data reserved for validation
BATCH\_SIZE    = 128
MAX\_TRIALS    = 10         # how many configurations the tuner will test
TUNER\_EPOCHS  = 5          # short runs during Bayesian optimization
FINAL\_EPOCHS  = 10         # full training of the best model

# Reproducibility
SEED = 42

# Apply seed across all major libraries and environments
os.environ\['PYTHONHASHSEED'\] = str(SEED)
random.seed(SEED)
np.random.seed(SEED)
tf.random.set\_seed(SEED)

With all of these set, two runs of this notebook, on the same hardware and TensorFlow version, will produce identical results (assuming that you did not modify the network, preprocessing, etc.). That’s especially useful once we start tuning hyperparameters, since it lets us compare model configurations fairly.

### Loading the Dataset

TensorFlow makes loading MNIST effortless through its built-in `keras.datasets` module. It automatically downloads the dataset if it’s not already cached locally and returns two tuples: training data and test data.

(X\_train\_full, y\_train\_full), (X\_test, y\_test) = mnist.load\_data()

print("Train full:", X\_train\_full.shape)
print("Test:", X\_test.shape)

At this point, `X_train_full` and `X_test` are arrays of grayscale images, and the labels (`y_train_full`, `y_test`) are integers between 0 and 9. After you run this code, you will see that we have 60,000 train data, and 10,000 test data.

In a real world scenario, you will likely have a folder with images. The data loading process will look different. But that’s not the purpose of this tutorial.

### Basic Data Preprocessing

Neural networks learn faster and more reliably when inputs are scaled to a consistent range. Here we normalize pixel values from `[0, 255]` down to `[0, 1]`.  
We also add a channel dimension, since the convolutional neural network architecture expects data in the form `(height, width, channels)`.

X\_train\_full = X\_train\_full.astype("float32") / 255.0
X\_test       = X\_test.astype("float32") / 255.0

# Add channel dimension: (N, 28, 28) → (N, 28, 28, 1)
X\_train\_full = np.expand\_dims(X\_train\_full, axis=-1)
X\_test       = np.expand\_dims(X\_test, axis=-1)

After this, each image is a small 3D array — 28×28 pixels with one channel — exactly what a CNN expects.

### One-Hot Encoding the Labels

For classification tasks, labels are usually converted to one-hot encoded vectors. Instead of a single number like `5`, we represent each label as a binary vector of length 10, where only the correct class is `1`.  
This format works seamlessly with TensorFlow’s categorical loss functions.

y\_train\_full = to\_categorical(y\_train\_full, NUM\_CLASSES)
y\_test\_onehot = to\_categorical(y\_test, NUM\_CLASSES)

### Splitting Training and Validation Data

Before training, it’s a good idea to set aside part of the training data for validation. This allows us to evaluate how well the model generalizes before touching the test set.

X\_train, X\_val, y\_train, y\_val = train\_test\_split(
    X\_train\_full, y\_train\_full,
    test\_size=VAL\_SPLIT,
    random\_state=SEED
)

print("Train:", X\_train.shape)
print("Validation:", X\_val.shape)
print("Test:", X\_test.shape)

By keeping validation separate, we can check the model’s accuracy during training and detect overfitting early. After running this code you should have 3 sets of data:

-   Train: `(42000, 28, 28, 1)`
-   Validation: `(18000, 28, 28, 1)`
-   Test: `(10000, 28, 28, 1)`

### Exploring the Dataset

Before we start building the model, let’s visualize a few samples. This quick check ensures the data loaded correctly and gives an intuitive sense of what the network will learn to recognize.

plt.figure(figsize=(8, 2))
for i in range(8):
    plt.subplot(1, 8, i + 1)
    plt.imshow(X\_train\[i\].squeeze(), cmap="gray")
    plt.axis("off")
    plt.title(np.argmax(y\_train\[i\]))
plt.suptitle("MNIST Examples")
plt.tight\_layout()
plt.show()

You should see a row of handwritten digits like below, some thick, some thin, some slightly tilted. These small variations are what make MNIST useful: they force the network to learn patterns that generalize rather than memorize exact shapes.

![MNIST dataset sample](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/mnist-dataset-sample.jpeg?resize=1000%2C214&quality=81&ssl=1)

At this point, our data is fully prepared: loaded, normalized, encoded, and split. Next, we’ll start building the convolutional neural network architecture itself, one block at a time, and see how each component contributes to the final model.

## Building the Convolutional Neural Network

We’ll build the model the same way you’d assemble LEGO: one small, understandable block at a time. First I’ll show each method and explain what it does in plain language. Then I’ll give you the full class so you can paste it into a single notebook cell and run it.

Before we start coding, it’s worth recalling what a convolutional neural network actually does.  
A CNN processes an image through a series of small filters that detect edges, curves, and patterns, then combines them to form higher-level representations. From pixels to shapes to whole objects[1](/). This layered, hierarchical structure is what makes CNNs so effective for visual data.

### Why This Design

The class is intentionally small. It has two helpers for building blocks and a `build()` method that assembles those blocks into a complete convolutional neural network:

-   `_add_conv_block(...)` adds one visual feature–extractor block.
-   `_add_dense_block(...)` adds one decision-making block.
-   `build(...)` stacks those blocks, then compiles the model with your chosen activation, optimizer, learning rate, and regularization.

### The Constructor: Shapes And Devices

The first thing the class does is remember what kind of images it will receive and how many categories it should predict. `input_shape` tells the network the size and layout of a single image: height, width, and channels. MNIST uses 28×28 grayscale images, so the shape is `(28, 28, 1)`, as we set initially in the global constants. This matters because the very first layer needs to know how to read the data coming in; give it the wrong shape and nothing lines up.

`num_classes` tells the final layer how many probabilities to produce. For MNIST we set it to 10 because there are ten digits, 0 through 9. If you later point the same class at a different dataset, say, five types of traffic signs, you’d only change `num_classes` to 5 (or the `NUM_CLASSES` global constant) and the rest of the network would adapt. Keeping these two pieces, shape and number of classes, at the top makes the model reusable without touching the internal blocks.

Right after that, the constructor checks your hardware. If there’s more than one GPU, it prepares a mirrored strategy so the same model runs on all of them in parallel. If there isn’t, it quietly falls back to a single GPU or CPU. You don’t need to change any training code for either case.

class SimpleCNN:
    def \_\_init\_\_(self, input\_shape=INPUT\_SHAPE, num\_classes=NUM\_CLASSES):
        self.input\_shape = input\_shape
        self.num\_classes = num\_classes
        # Multi-GPU: mirror the model across GPUs if more than one is present
        if len(tf.config.list\_physical\_devices('GPU')) > 1:
            print("Multiple GPUs detected, using MirroredStrategy.")
            self.strategy = tf.distribute.MirroredStrategy()
        else:
            self.strategy = None
        self.model = None

### Convolution Block: From Pixels To Patterns

A convolution block is where the network learns to “see.” Imagine looking at a digit with a tiny stencil that you slide across the image, checking one small patch at a time. The convolution layer (`Conv2D`) is that stencil. It learns little detectors. One might respond strongly to a vertical edge, another to a curve, and another to a diagonal stroke. Because the stencil slides over every location, the layer can spot the same pattern wherever it appears.

Right after the convolution, the numbers flowing through the network can vary a lot from batch to batch. `BatchNormalization` calms that down. It keeps values in a comfortable range so the next layer doesn’t overreact when the input shifts slightly. Once the signals are stable, we apply the `Activation`. Think of it as a gate that decides which signals matter. With `ReLU`, everything below zero is shut off and everything above zero passes through, which helps the model focus on useful features and keeps training efficient.

Pooling is the moment we zoom out. After the layer finds strong responses, `MaxPooling2D` takes a small window and keeps only the strongest signal from that window. You can consider it to be a summary: “Something important happened around here.” This reduces the size of the data the network needs to carry forward and makes the model less sensitive to tiny shifts in the image.

Put together, one block does four things in order: detect small patterns, stabilize the numbers, keep meaningful signals, and compress space so later layers can work with clearer, lighter inputs.

This combination of convolution, activation, and pooling appears in almost every CNN architecture, from early models like LeNet-5 to deeper networks such as ResNet and EfficientNet.[2](/)

Despite their differences, all share the same principle: detect local features, compress what matters, and pass it forward.

    def \_add\_conv\_block(self, model, filters, l2\_value, activation, input\_shape=None):
        """Add a Conv2D -> BatchNorm -> Activation -> MaxPool2D block.
        Specify input\_shape only for the first block."""
        conv\_args = {
            "filters": filters,
            "kernel\_size": (3, 3),
            "padding": "same",
            "activation": None,
            "kernel\_regularizer": regularizers.l2(l2\_value)
        }
        if input\_shape is not None:
            conv\_args\["input\_shape"\] = input\_shape

        # 1) Convolution: learns small pattern detectors (e.g., edges)
        model.add(layers.Conv2D(\*\*conv\_args))

        # 2) BatchNorm: stabilizes the numbers flowing through the network
        model.add(layers.BatchNormalization())

        # 3) Activation: makes the block non-linear (e.g., ReLU)
        model.add(layers.Activation(activation))

        # 4) MaxPooling: keeps the strongest signals, reduces size/compute
        model.add(layers.MaxPooling2D((2, 2)))

### Dense Block: From Features To Decisions

By the time we reach the dense block, the image has been turned into a stack of feature maps and then flattened into a long vector. The `Dense` layer looks at *all* of those features at once and starts to combine them into a decision. Batch normalization plays the same stabilizing role here as before, smoothing the values so training remains predictable. The activation adds the non-linear step that lets the layer model more complex relationships.

`Dropout` is a safety mechanism. During training, it randomly turns off a fraction of the neurons in this block. For example, a 0.3 dropout means 30% of neurons are temporarily disabled during training. That forces the model to rely on multiple clues rather than a single “pet” feature and usually leads to better generalization when you test the model on new images.

Both techniques are forms of regularization, helping the model generalize beyond the training data by keeping activations stable and reducing dependency on any one feature.[3](/)

    def \_add\_dense\_block(self, model, units, l2\_value, activation, dropout):
        """Add Dense -> BatchNorm -> Activation -> Dropout block."""
        # 1) Dense: mixes all features to make a decision
        model.add(layers.Dense(units, activation=None,
                               kernel\_regularizer=regularizers.l2(l2\_value)))

        # 2) BatchNorm: same reason as above, stabilizes training
        model.add(layers.BatchNormalization())

        # 3) Activation: non-linearity for the decision layer
        model.add(layers.Activation(activation))

        # 4) Dropout: randomly turns off some neurons to reduce overfitting
        model.add(layers.Dropout(dropout))

### Putting It Together: `build(...)`

The `build` method assembles the network in a straight line you can read: one convolution block that sees simple strokes, a second block that refines them, a flatten step that rolls the 2D feature maps into a 1D vector, a dense block that mixes those signals into a coherent representation, and a final classifier that turns that representation into a prediction.

`Flatten` is just bookkeeping: convolution layers work in two spatial dimensions; dense layers expect a single long vector. `Flatten` does that conversion without changing the information.

The last layer uses `softmax`, which turns raw scores into a clean probability distribution across the classes. For a digit image, the output might read like “0.001 for 0, 0.003 for 1, …, 0.972 for 7.” Because those are probabilities across multiple classes, we train with `categorical_crossentropy`. That loss function compares the predicted probability distribution with the true distribution (the one-hot label) and encourages the model to put most of its confidence on the correct class while pulling confidence away from the others. You’ll sometimes see `sparse_categorical_crossentropy` used with integer labels; we’re using one-hot labels in this tutorial, so `categorical_crossentropy` is the natural fit.

The optimizer and learning rate control *how* the model learns. Think of the loss landscape as a hilly terrain where the optimizer is the way you walk downhill and the learning rate is the length of each step. Adam takes adaptive, well-sized steps; SGD takes simpler steps that you can augment with momentum; RMSprop is another adaptive choice that works well for many vision tasks.

We’ll let Bayesian optimization try different options later so you can *see* the impact rather than memorize rules.

![Llustration of the path followed by the gradient descent method to reach the minimum of a](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/llustration-of-the-path-followed-by-the-gradient-descent-method-to-reach-the-minimum-of-a.jpg?resize=692%2C387&quality=81&ssl=1 "Illustration of the path followed by the optimizer to improve accuracy. Image from ResearchGate.net.4")

The figure above shows the classic “hill and valley” view of how an optimizer trains a neural network.  
The colored surface represents the loss function — high points mean poor predictions, and low points mean better ones.  
The black path shows how the optimizer moves step by step downhill, adjusting the model’s weights to minimize that loss.

Different optimizers (like SGD, Adam, or RMSprop) follow slightly different paths, but they all aim for the same goal: finding the lowest valley where the model performs best.[5](/)

    def build(self, n\_filters=32, l2=0.0, lr=1e-3, optimizer='adam', dropout=0.0, activation='relu'):
        model = models.Sequential()

        # First Conv block: specify input shape here
        self.\_add\_conv\_block(model, n\_filters,       l2, activation, input\_shape=self.input\_shape)

        # Second Conv block: typically fewer filters after pooling
        self.\_add\_conv\_block(model, n\_filters // 2,  l2, activation)

        # Flatten feature maps into a 1D vector
        model.add(layers.Flatten())

        # Dense block for decision making
        self.\_add\_dense\_block(model, 64, l2, activation, dropout)

        # Final classifier: one probability per class (softmax)
        model.add(layers.Dense(self.num\_classes, activation='softmax'))

        # Pick optimizer class by name (e.g., 'adam' -> optimizers.Adam)
        opt\_cls = getattr(optimizers, optimizer.capitalize())

        # Compile inside strategy scope if we have multiple GPUs
        if self.strategy:
            with self.strategy.scope():
                self.model = model
                self.model.compile(
                    optimizer=opt\_cls(learning\_rate=lr),
                    loss='categorical\_crossentropy',  # using one-hot labels
                    metrics=\['accuracy'\]
                )
        else:
            self.model = model
            self.model.compile(
                optimizer=opt\_cls(learning\_rate=lr),
                loss='categorical\_crossentropy',
                metrics=\['accuracy'\]
            )

To visualize how this process scales up in larger models, take a look at the figure below.

![Vgg 16 network architecture](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/vgg-16-network-architecture.png?resize=677%2C430&quality=80&ssl=1 "The standard VGG-16 neural network architecture. Image by ResearchGate.net.6")

This is **VGG-16**, one of the most classic convolutional neural network architectures used in computer vision.  
It works exactly like our `SimpleCNN`, just with more layers and filters.

-   The **blue blocks** represent *convolution + ReLU* (activation) layers that extract features at increasing levels of abstraction.
-   The **red blocks** are *max pooling* layers that shrink the spatial dimensions while preserving key information.
-   The **green layers** on the right are *fully connected (dense) layers* that combine everything the network has learned to make a final prediction.

At the far left, an image enters the network as raw pixels. As it passes through each layer, it’s gradually transformed from shapes and edges into meaningful patterns the model can recognize — for example, the outline of a number or, later, in more complex tasks, the shape of a face or a car.  
That’s the core idea behind every CNN: **turning pixels into patterns and patterns into understanding.**

### Training, Evaluating, Summarizing

Once the model is built, `summary()` gives you an instant blueprint of the architecture: layers, shapes, and parameter counts. It’s the quickest sanity check you have. If the shapes look wrong here, they’ll be wrong during training.

`fit(...)` is where learning happens. The model sees batches of images and their labels, makes predictions, and nudges its weights to reduce the loss. Each epoch is one pass through the training set. We also pass validation data so you can watch how the model performs on images it hasn’t seen during training. If training accuracy goes up while validation accuracy stalls or drops, the model is starting to memorize rather than learn patterns that generalize.

`evaluate(...)` runs a clean test on a dataset and reports the final loss and accuracy. Use it to measure where you actually ended up after training and to compare different hyperparameter choices fairly.

    def summary(self):
        self.model.summary()

    def fit(self, X\_train, y\_train, X\_val, y\_val, epochs=FINAL\_EPOCHS, batch\_size=BATCH\_SIZE):
        return self.model.fit(
            X\_train, y\_train,
            epochs=epochs,
            batch\_size=batch\_size,
            validation\_data=(X\_val, y\_val),
            verbose=2
        )

    def evaluate(self, X, y):
        return self.model.evaluate(X, y, verbose=0)

### The Full Class (Paste In One Cell)

Here’s the complete class so you can copy it in one go:

class SimpleCNN:
    def \_\_init\_\_(self, input\_shape=INPUT\_SHAPE, num\_classes=NUM\_CLASSES):
        self.input\_shape = input\_shape
        self.num\_classes = num\_classes
        # Check for multi-GPU
        if len(tf.config.list\_physical\_devices('GPU')) > 1:
            print("Multiple GPUs detected, using MirroredStrategy.")
            self.strategy = tf.distribute.MirroredStrategy()
        else:
            self.strategy = None
        self.model = None

    def \_add\_conv\_block(self, model, filters, l2\_value, activation, input\_shape=None):
        """Add a Conv2D -> BatchNorm -> Activation -> MaxPool2D block.
        Specify input\_shape only for the first block."""
        conv\_args = {
            "filters": filters,
            "kernel\_size": (3, 3),
            "padding": "same",
            "activation": None,
            "kernel\_regularizer": regularizers.l2(l2\_value)
        }
        if input\_shape is not None:
            conv\_args\["input\_shape"\] = input\_shape

        model.add(layers.Conv2D(\*\*conv\_args))
        model.add(layers.BatchNormalization())
        model.add(layers.Activation(activation))
        model.add(layers.MaxPooling2D((2, 2)))

    def \_add\_dense\_block(self, model, units, l2\_value, activation, dropout):
        """Add Dense -> BatchNorm -> Activation -> Dropout block."""
        model.add(layers.Dense(units, activation=None, kernel\_regularizer=regularizers.l2(l2\_value)))
        model.add(layers.BatchNormalization())
        model.add(layers.Activation(activation))
        model.add(layers.Dropout(dropout))

    def build(self, n\_filters=32, l2=0.0, lr=1e-3, optimizer='adam', dropout=0.0, activation='relu'):
        model = models.Sequential()
        # First Conv block
        self.\_add\_conv\_block(model, n\_filters,       l2, activation, input\_shape=self.input\_shape)
        # Second Conv block
        self.\_add\_conv\_block(model, n\_filters // 2,  l2, activation)
        model.add(layers.Flatten())
        # Dense block
        self.\_add\_dense\_block(model, 64, l2, activation, dropout)
        model.add(layers.Dense(self.num\_classes, activation='softmax'))

        opt\_cls = getattr(optimizers, optimizer.capitalize())
        if self.strategy:
            with self.strategy.scope():
                self.model = model
                self.model.compile(
                    optimizer=opt\_cls(learning\_rate=lr),
                    loss='categorical\_crossentropy',
                    metrics=\['accuracy'\]
                )
        else:
            self.model = model
            self.model.compile(
                optimizer=opt\_cls(learning\_rate=lr),
                loss='categorical\_crossentropy',
                metrics=\['accuracy'\]
            )

    def summary(self):
        self.model.summary()

    def fit(self, X\_train, y\_train, X\_val, y\_val, epochs=FINAL\_EPOCHS, batch\_size=BATCH\_SIZE):
        return self.model.fit(
            X\_train, y\_train,
            epochs=epochs, batch\_size=batch\_size,
            validation\_data=(X\_val, y\_val), verbose=2
        )

    def evaluate(self, X, y):
        return self.model.evaluate(X, y, verbose=0)

## Training a Baseline CNN

Before we start fine-tuning and optimizing, it’s good practice to build a baseline model.  
This first run sets a reference point, something to compare against when we later tweak hyperparameters. Even if it’s not perfect, it shows that our CNN neural network can train end-to-end and produce reasonable results.

In a real world scenario, you can expect the baseline accuracy to be poor.

### Running the Baseline Model

We’ll use the `SimpleCNN` class exactly as we built it, with all default settings:

-   32 filters in the first convolution layer.
-   no L2 regularization or dropout.
-   learning rate of 0.001.
-   Adam optimizer.
-   and ReLU activations.

In your notebook, add a new cell and run:

\# --- Baseline model (before optimization) ---
print("n========= Baseline SimpleCNN Training =========n")

baseline\_cnn = SimpleCNN()
baseline\_cnn.build()  # use all defaults (n\_filters=32, l2=0.0, lr=1e-3, optimizer='adam', dropout=0.0, activation='relu')
baseline\_cnn.summary()

Here we instantiate the model and call `.build()` without passing any parameters, letting it use the defaults we defined earlier. The model is fully compiled and ready to train.

At this point, it’s useful to print a summary. We do that with `.summary()`.  
This table is automatically generated by Keras and lists every layer, its output shape, and how many parameters it contains. It’s a quick way to confirm that the architecture matches your expectations, especially after stacking multiple convolution and dense blocks.

| **Layer (type)** | **Output Shape** | **Param #** |
| --- | --- | --- |
| conv2d (Conv2D) | (None, 28, 28, 32) | 320 |
| batch\_normalization (BatchNormalization) | (None, 28, 28, 32) | 128 |
| activation (Activation) | (None, 28, 28, 32) | 0 |
| max\_pooling2d (MaxPooling2D) | (None, 14, 14, 32) | 0 |
| conv2d\_1 (Conv2D) | (None, 14, 14, 16) | 4,624 |
| batch\_normalization\_1 (BatchNormalization) | (None, 14, 14, 16) | 64 |
| activation\_1 (Activation) | (None, 14, 14, 16) | 0 |
| max\_pooling2d\_1 (MaxPooling2D) | (None, 7, 7, 16) | 0 |
| flatten (Flatten) | (None, 784) | 0 |
| dense (Dense) | (None, 64) | 50,240 |
| batch\_normalization\_2 (BatchNormalization) | (None, 64) | 256 |
| activation\_2 (Activation) | (None, 64) | 0 |
| dropout (Dropout) | (None, 64) | 0 |
| dense\_1 (Dense) | (None, 10) | 650 |
| **Total parameters** | **56,282** |
| **Trainable parameters** | **56,058** |
| **Non-trainable parameters** | **224** |

In total, the network has **56,058 trainable parameters**, small enough to train in seconds, but still large enough to demonstrate how convolution, pooling, and dense layers interact.

Every line here maps directly to the code we wrote. This summary is your first sanity check before training: if a layer’s shape or parameter count looks off, it’s much easier to catch it here than after a long training run.

Notice in the table how the output shape shrinks as the data pass through the convolutional blocks, from 28×28 to 7×7.

### Training the CNN

Next, we’ll fit the model on the training data for a few epochs. Even though MNIST is small, training still takes a bit of time. Each epoch passes through all images once, adjusting weights to reduce the loss.

history\_base = baseline\_cnn.fit(
    X\_train, y\_train,
    X\_val, y\_val,
    epochs=FINAL\_EPOCHS
)

The `history_base` variable stores loss and accuracy values for each epoch, both for training and validation. We’ll use this next to plot the learning curves.

### Plotting Training Progress

Looking at accuracy and loss numbers in the console does not tell the whole truth. But plotting them gives you a full picture of how your CNN TensorFlow model is learning.

Create two small plots, one for loss, one for accuracy:

def plot\_training\_history(history):
    acc = history.history\['accuracy'\]
    val\_acc = history.history\['val\_accuracy'\]
    loss = history.history\['loss'\]
    val\_loss = history.history\['val\_loss'\]
    epochs = range(1, len(acc) + 1)

    plt.figure(figsize=(12, 4))

    # Accuracy plot
    plt.subplot(1, 2, 1)
    plt.plot(epochs, acc, 'bo-', label='Training accuracy')
    plt.plot(epochs, val\_acc, 'ro-', label='Validation accuracy')
    plt.title('Training and Validation Accuracy')
    plt.xlabel('Epochs')
    plt.ylabel('Accuracy')
    plt.legend()

    # Loss plot
    plt.subplot(1, 2, 2)
    plt.plot(epochs, loss, 'bo-', label='Training loss')
    plt.plot(epochs, val\_loss, 'ro-', label='Validation loss')
    plt.title('Training and Validation Loss')
    plt.xlabel('Epochs')
    plt.ylabel('Loss')
    plt.legend()

    plt.tight\_layout()
    plt.show()

plot\_training\_history(history\_base)

If both training and validation lines steadily go down for loss (or up for accuracy), your model is learning.  
If the validation curve flattens or diverges from training, the model may be overfitting. It’s memorizing training data rather than learning general patterns.

![CNN baseline accuracy plot](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/cnn-accuracy-plot.jpeg?resize=1000%2C331&quality=81&ssl=1)

In the accuracy plots above, both lines rise quickly and meet near the top. That’s a good sign. It means the model is learning meaningful features and not just memorizing the training data. When training and validation accuracy move together and stay close, it usually indicates that the network is generalizing well.

On the loss plot, both training and validation loss drop sharply in the first few epochs and then stabilize near zero. This tells us the model converged quickly and the optimizer found a good minimum. If you imagine the optimizer’s job as “rolling down a hill,” this is the point where it reached the bottom and stopped bouncing around.

MNIST is a simple dataset, so this kind of near-perfect curve isn’t unusual. A small CNN like ours can learn to classify handwritten digits almost perfectly after just a few passes through the data.

In more complex real-world datasets, you’d rarely see curves this clean. Training and validation lines might separate or fluctuate. That’s where tuning hyperparameters, regularization, or data augmentation becomes essential.

## Optimizing With Bayesian Search (KerasTuner)

We have a solid baseline. Now we’ll let the machine do the guessing. Bayesian optimization tries different hyperparameters, learns from each result, and proposes smarter next choices. We’ll use `[KerasTuner](https://keras.io/keras_tuner/)` so we can keep our same `SimpleCNN` class and only describe the search space.

### Define The Search Space

This function tells the tuner what it may change. We clear the Keras session to avoid leftover graphs between trials, create a `SimpleCNN` with the sampled values, and return the compiled Keras model (not the class).

def model\_builder(hp):
    tf.keras.backend.clear\_session()

    n\_filters = hp.Int('n\_filters', 16, 64, step=8)
    l2        = hp.Float('l2', 0.0, 0.01, step=0.002)
    lr        = hp.Float('lr', 1e-4, 1e-2, sampling='log')
    optimizer\_choice = hp.Choice('optimizer', \['adam', 'sgd'\])
    dropout   = hp.Float('dropout', 0.0, 0.4, step=0.1)
    activation= hp.Choice('activation', \['relu', 'tanh'\])

    cnn = SimpleCNN()
    cnn.build(
        n\_filters=n\_filters,
        l2=l2,
        lr=lr,
        optimizer=optimizer\_choice,
        dropout=dropout,
        activation=activation
    )
    return cnn.model

**What’s happening:**

-   The tuner will try different values for filters, L2, learning rate, optimizer, dropout, and activation — all levers that shape our convolutional neural network architecture and training behavior.
-   We still use the same CNN in TensorFlow class; no duplicate model code.

### Create The Tuner

We ask for the configuration that maximizes validation accuracy. `MAX_TRIALS` limits how many model versions we’ll test; the `SEED` keeps runs reproducible.

tuner = BayesianOptimization(
    model\_builder,
    objective='val\_accuracy',
    max\_trials=MAX\_TRIALS,
    seed=SEED,
    overwrite=True,
    directory='kt\_tuner\_dir',
    project\_name='mnist\_cnn'
)

Bayesian optimization is smart about where it looks. This is why we chose it over other search models. Instead of testing every possible combination like grid search, or picking random ones and hoping to get lucky like random search, it actually learns from past trials. After each run, it builds a simple model of how the results behave and uses that to decide which hyperparameter sets are most promising to try next.

For small search spaces, the difference might be small. As soon as you start tuning multiple parameters (like filters, dropout, and learning rate), Bayesian search saves a lot of time and compute.

| **Method** | **How It Works** | **Pros** | **Cons** |
| --- | --- | --- | --- |
| **Grid Search** | Tries every combination on a fixed grid | Simple, exhaustive | Exponential time cost, redundant trials |
| **Random Search** | Picks random combinations | Fast to set up, covers wide space | May miss optimal regions |
| **Bayesian Search** | Learns from past results to choose next promising trials | More efficient, fewer total runs | Slightly more complex to configure |

That efficiency is why we’re using Bayesian optimization here. It finds good hyperparameters faster and with fewer trials. Perfect for our image classification problem where we want practical results without burning time or GPU hours.

### Run The Search

We run short, cheap trainings per trial so the tuner can compare ideas fast. Think of these epochs as “auditions,” not the final performance.

print("n========= Starting Bayesian hyperparameter search using KerasTuner ... =========n")
tuner.search(
    X\_train, y\_train,
    epochs=TUNER\_EPOCHS,
    validation\_data=(X\_val, y\_val),
    verbose=2
)

When this finishes, we fetch the best hyperparameters and print them. It’s a nice way to show readers which choices mattered for this convolutional neural network example.

best\_hps = tuner.get\_best\_hyperparameters(num\_trials=1)\[0\]
print("Best hyperparameters found:")
for hpname in best\_hps.values.keys():
    print(f"{hpname}: {best\_hps.get(hpname)}")

It turns out that the best hyperparameters for this CNN are not the default values we initially set. They are the following:

n\_filters: 48
l2: 0.0
lr: 0.0006562536901904111
optimizer: adam
dropout: 0.4
activation: relu

### Retrain The Best Model

Now we build a fresh model with those best settings and train it properly (more epochs). Same class, no code rewrites.

print("n========= Retrain best model found by KerasTuner =========n")
cnn\_final = SimpleCNN()
cnn\_final.build(
    n\_filters=best\_hps.get('n\_filters'),
    l2=best\_hps.get('l2'),
    lr=best\_hps.get('lr'),
    optimizer=best\_hps.get('optimizer'),
    dropout=best\_hps.get('dropout'),
    activation=best\_hps.get('activation')
)
history = cnn\_final.fit(X\_train, y\_train, X\_val, y\_val, epochs=FINAL\_EPOCHS)

A quick reminder for readers following along on Windows with Docker: if a GPU is available, the CNN TensorFlow model will use it automatically; otherwise it runs on CPU with identical results, just slower.

### Visualizing the Final Training Curves

As before, we can call our plotting helper to see the final accuracy and loss curves.

You will notice smoother and more stable training compared to the baseline, even though the difference on MNIST will be subtle. We’ll use the same plotting helper defined earlier to visualize this training run.

plot\_training\_history(history)

The figure below shows both training and validation curves. Compared to our earlier baseline, they converge even faster and remain tightly aligned; a sign that the optimized model learned efficiently without overfitting.

![Cnn optimized accuracy plot](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/cnn-optimized-accuracy-plot.jpeg?resize=1000%2C327&quality=81&ssl=1)

## Evaluating on the Test Set

Once the model has finished training, we evaluate it on the test set — the 10,000 images it has never seen. This gives an unbiased measure of generalization.

test\_loss, test\_acc = cnn\_final.evaluate(X\_test, y\_test\_onehot)
print(f"Optimized Test accuracy: {test\_acc:.4f}")

You’ll likely see an accuracy of around **99%**, nearly perfect on MNIST.  
The small gap between validation and test accuracy means the model generalized well; it’s learning real digit patterns, not just memorizing the training examples.

## Looking at Model Predictions

Accuracy alone doesn’t show *how* the model makes decisions, so let’s visualize a few predictions.

preds = cnn\_final.model.predict(X\_test)

plt.figure(figsize=(8, 2))
for i in range(8):
    plt.subplot(1, 8, i + 1)
    plt.imshow(X\_test\[i\].squeeze(), cmap='gray')
    plt.axis('off')
    plt.title(np.argmax(preds\[i\]))
plt.suptitle("Model Predictions")
plt.show()

Each image below shows the input digit and the model’s predicted label on top.

![Cnn model predictions](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/cnn-model-predictions.jpeg?resize=800%2C184&quality=81&ssl=1)

If your model is performing well, nearly all of these should be correct. Still, visualizing predictions is good practice. It helps you spot systematic mistakes (for instance, confusing 3s and 8s, or 4s and 9s).

### Understanding the Confusion Matrix

A confusion matrix summarizes how the model performs across all classes — in this case, digits from 0 to 9. Each row represents the true label, and each column shows what the model predicted. Perfect classification would appear as a solid diagonal of blue squares.

y\_pred = np.argmax(preds, axis=1)
cm = confusion\_matrix(y\_test, y\_pred)
disp = ConfusionMatrixDisplay(confusion\_matrix=cm, display\_labels=np.arange(NUM\_CLASSES))
disp.plot(cmap=plt.cm.Blues)
plt.title("Confusion Matrix")
plt.show()

The darker the diagonal, the more correctly predicted samples for that digit. Off-diagonal values represent misclassifications, the model’s “blind spots.” For instance, if you see numbers in the cell for “5 predicted as 3,” it means those digits share visual features the CNN occasionally confuses.

![Cnn confusion matrix](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/cnn-confusion-matrix.jpeg?resize=522%2C430&quality=81&ssl=1)

### Classification Report

Finally, print a detailed classification report showing precision, recall, and F1-score per class.

print("Classification Report:")
print(classification\_report(y\_test, y\_pred, digits=4))

This breakdown helps identify which classes perform slightly worse — something global accuracy can hide.  
For MNIST, these scores are typically near 1,000 across all digits, confirming that our optimized CNN TensorFlow model learned to classify handwritten digits almost perfectly.

Classification Report:
              precision    recall  f1-score   support

           0     0.9929    0.9959    0.9944       980
           1     0.9887    0.9991    0.9939      1135
           2     0.9961    0.9826    0.9893      1032
           3     0.9843    0.9941    0.9892      1010
           4     0.9820    0.9980    0.9899       982
           5     0.9865    0.9854    0.9860       892
           6     0.9947    0.9875    0.9911       958
           7     0.9817    0.9922    0.9869      1028
           8     0.9877    0.9897    0.9887       974
           9     0.9959    0.9643    0.9799      1009

    accuracy                         0.9890     10000
   macro avg     0.9890    0.9889    0.9889     10000
weighted avg     0.9891    0.9890    0.9890     10000

## Wrapping It Up

We just built, trained, and optimized a complete **convolutional neural network** from scratch, one block at a time. Along the way, you saw how each layer contributes: convolutions extract patterns, pooling reduces noise, normalization stabilizes learning, and activation functions add flexibility.

This wasn’t about chasing the highest accuracy on MNIST. It was about understanding what’s happening under the hood, enough to make sense of any CNN architecture you’ll encounter later.  
When you know how these pieces fit, pre-trained models stop being magic. You can adapt, extend, or debug them with confidence.

At one point, I tried to apply a CNN to classify fantasy Dungeons & Dragons miniature images by race — elves, dwarves, orcs, and so on. It was part of a project that turned into a different type of neural network. It didn’t work well.  
Not because the network was wrong, but because I didn’t have enough clean, labeled data to train it.  
That experience drove home a lesson most tutorials skip: even the best models are only as good as the data you feed them.

The difference between a hobby project and a working model often comes down to data quality, scale, and variety — and the only way to learn that is by experimenting yourself.

## Next Steps: Go Beyond MNIST

Now that you’ve built and optimized a convolutional neural network from scratch, you can challenge it with more complex datasets. MNIST is the “Hello, World!” of image classification. Perfect for learning, but far too simple to stop here.

If you want to see how your CNN handles more realistic images, try these next:

-   🐶 **[CIFAR-10](https://www.tensorflow.org/datasets/catalog/cifar10)**: 60,000 color images across 10 classes (airplanes, cats, cars, etc.). Ideal next step: it’s still small enough to train on a laptop but requires deeper networks to perform well.
-   🌍 **[Fashion-MNIST](https://github.com/zalandoresearch/fashion-mnist)**: 70,000 grayscale images of clothes and accessories. Similar shape as MNIST (28×28×1), so you can reuse your entire pipeline with almost no change.

Try replacing the dataset loading section in your notebook with one of these and retraining your model. You will need to adapt the data loading with the new structure of the data.

You’ll notice that the same principles apply — convolution, normalization, and pooling — but performance now depends heavily on network depth, regularization, and data quality.

That’s where the real learning begins.

## Download the Full Notebook

You can download the full Jupyter notebook used in this tutorial below. It includes all code, comments, and Markdown explanations, ready to run inside your Jupyter setup.

1.  Zewen Li, Wenjie Yang, Shouheng Peng, Fan Liu. “*[A Survey of Convolutional Neural Networks: Analysis, Applications, and Prospects](https://arxiv.org/abs/2004.02806)*”. arXiv:2004.02806 \[cs.CV\]. April 1, 2020. [↩︎](#0ad620dc-63a8-43bf-98e8-064de3b97827-link)
2.  Khan, A., Sohail, A., Zahoora, U. et al. “*[A survey of the recent architectures of deep convolutional neural networks.](https://arxiv.org/abs/1901.06032)*”. arXiv:1901.06032 \[cs.CV\]. January 17, 2019. [↩︎](#5c5c94d1-4086-4833-b7ff-71c93d586cad-link)
3.  Claudio Filipi Gonçalves Dos Santos and João Paulo Papa. “*[Avoiding Overfitting: A Survey on Regularization Methods for Convolutional Neural Networks](https://arxiv.org/abs/2201.03299)*”. arXiv:2201.03299 \[cs.CV\]. January 10, 2022. [↩︎](#258290cc-efbf-41ae-a716-3c9a14e6de16-link)
4.  Amini, Alexander & Amini, Ava & Karaman, Sertac & Rus, Daniela. ”*[Spatial Uncertainty Sampling for End-to-End Control.](https://arxiv.org/abs/1805.04829)*” arXiv:1805.04829 \[cs.AI\]. May 13, 2018. [↩︎](#5bdac8c7-19d7-472d-8b12-1b4caba014b3-link)
5.  Sebastian Ruder. *“[An Overview of Gradient Descent Optimization Algorithms](https://arxiv.org/abs/1609.04747)”*. arXiv:1609.04747 \[cs.LG\]. September 15, 2016. [↩︎](#458b280b-87a9-438c-aa9f-f4aa0ac6a497-link)
6.  Ferguson, Max & ak, Ronay & Lee, Yung-Tsun & Law, Kincho. “*[Automatic localization of casting defects with convolutional neural networks.](https://www.researchgate.net/publication/322512435_Automatic_localization_of_casting_defects_with_convolutional_neural_networks)*” 1726-1735. 10.1109/BigData.2017.8258115. 2017. [↩︎](#540a3a03-0ca5-4568-9982-4f624d2acccd-link)
