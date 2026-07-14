---
title: Set Up TensorFlow with Docker and Jupyter Notebook
date: 2025-10-25T02:00:03
updated: 2025-12-04T06:30:07
sticky: false
cornerstone: false
excerpt: Create a stable TensorFlow lab with Docker and Jupyter, avoiding
  dependency hell and keeping notebooks reproducible.
categories:
  - Web
tags:
  - AI
  - Python
  - Workflow
coverAlt: Docker and TensorFlow Environment
originalCover: https://buthonestly.io/wp-content/uploads/2026/01/docker-tensorflow-environment.jpg
---

Before the first line of code, you need an environment that won’t fight you.

> [!summary]- Quick Summary
>
> - Local TensorFlow installs often break on CUDA, drivers, or Python versions, wasting hours before you even start coding.
> - Using the official `tensorflow/tensorflow:latest-gpu-jupyter` Docker image gives you Python, TensorFlow, CUDA, and Jupyter in one reproducible setup.
> - Apple Silicon users need a different Docker image and a `docker run` command, but still get an isolated Jupyter Lab environment.
> - You open Jupyter from the container logs via the tokenized URL, which grants full access and must be kept private.
> - A quick test notebook verifies Python, TensorFlow version, and GPU visibility, proving the environment is ready for real deep learning work.
> - Once it runs, restarting your TensorFlow lab is just starting the same container, so experiments stay organized and repeatable.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

If you’ve ever tried setting up a deep learning environment locally, you know how quickly things can break.

This TensorFlow Docker setup guide provides a complete TensorFlow Jupyter Docker environment that solves dependency conflicts and creates a reproducible machine learning environment. Whether you’re dealing with CUDA compatibility issues or Python version mismatches, this Docker TensorFlow environment setup eliminates those headaches.

Before we start coding, we need a place to work that’s clean, predictable, and easy to rebuild. Machine learning libraries depend on specific versions of Python and GPU drivers, and setting them up manually can quickly turn into a frustrating loop of errors. Believe me, I learned this the hard way.

To avoid that, we’ll run everything inside a contained environment, one that isolates our setup from the rest of the system and gives us a fresh start every time.

## What We’ll Use and Why

By combining these tools, you’ll create a reproducible machine learning environment that works identically across all systems—eliminating the classic ‘it works on my machine’ problem that plagues traditional TensorFlow installations.

### Docker

[Docker](https://www.docker.com/) is a container system that lets you run isolated environments. It guarantees that everyone following my [AI tutorials](/topic/ai/ "AI"), including you a year from now, will have the same working setup. No conflicting dependencies, no reinstalling Python packages, and no “works on my machine” moments.

Docker’s reproducibility becomes even more valuable in modern development workflows where AI-assisted coding and [[what-is-vibe-coding-how-to-do-it|vibe coding practices]] are becoming standard—you need environments that work consistently regardless of who (or what) generated the code.

### Jupyter Notebook

[Jupyter](https://jupyter.org/) is an interactive coding environment that runs in your browser. It lets you mix text, code, and visualizations in one place, making it ideal for tutorials and experiments.

### TensorFlow

[TensorFlow](https://www.tensorflow.org/) is the deep learning framework used to build our neural networks. It’s widely supported, integrates smoothly with Docker, and includes high-level APIs like Keras that make experimentation simple. There’s another excellent option called [PyTorch](https://pytorch.org/), which you’ll often see in research settings. PyTorch is known for flexibility and debugging convenience, while TensorFlow shines when it comes to deployment, performance, and ecosystem tooling. For a beginner-friendly introduction to machine learning, TensorFlow is the more stable and forgiving choice.

## TensorFlow Docker Setup: Installing and Pulling the Image

If you don’t have Docker yet, download Docker Desktop for Windows from [docker.com](https://www.docker.com/products/docker-desktop/) and follow the installer’s steps. If you are on macOS or Linux, download the respective installer. At the moment of writing, I’m using version 4.49.0 on macOS.

Once it’s running, open it. You’ll see on the left tabs for _Containers_, _Images_, _Volumes_, etc. We’ll use the Images tab first. In the middle, there’s the **Search images to run** button.

![Docker search image](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/docker-search-image.jpeg?resize=1000%2C685&quality=81&ssl=1)

Click on it to open the search field and type in it:

```bash
tensorflow/tensorflow:latest-gpu-jupyter
```

A dropdown with several options will appear. The first one should be `tensorflow/tensorflow`. From the **Tag** dropdown on the right, choose `latest-gpu-jupyter` and click **Pull**.

![Docker tensorflow latest image](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/docker-tensorflow-latest-image.jpg?resize=921%2C631&quality=81&ssl=1)

This process downloads the official TensorFlow image that includes everything we need: Python, TensorFlow, CUDA, and Jupyter Notebook. It’s maintained by the TensorFlow team, so you can rely on it being compatible and up to date. The download might take a few minutes the first time.

## TensorFlow Container Configuration: Running Your Environment

When the image finishes downloading, it’ll appear in your list of available images. Click **Run** to start a new container. A configuration window will open. Expand the **Optional settings** and fill in the following fields:

In the **Ports** field, enter `8888`. That’s the port Jupyter uses, and it’s how we’ll access it from the browser. Next, scroll to **Volumes**. This is where we connect a folder on your computer to the container so that anything you save inside Jupyter persists outside Docker too.

On Windows, I usually use a path like `C:Users<your-name>Python-Projects`. Set that as the **Host path**, and enter `/tf/notebooks` as the **Container path**. That’s where Jupyter stores notebooks by default.

Click **Run**. Docker starts the container and automatically launches Jupyter Notebook inside it.

### Creating a Container for macOS Users

**Note for macOS users on Apple Silicon processors**: The setup above won’t work due to incompatibilities with hardware. After installing and opening Docker Desktop, via Terminal, run this command:

```bash
docker run --rm -it -p 8888:8888 --shm-size=1g -e JUPYTER_TOKEN=dev -v /path/to/your/notebooks:/home/jovyan/work -w /home/jovyan/work quay.io/jupyter/tensorflow-notebook:53b1d144db49
```

Replace the `/path/to/your/notebooks` path with where you want your notebooks to be. This image contains Jupyter Lab instead of regular Jupyter. It’s basically the same but the UI is slightly different.

**Note**: the images can be a few GB in size. Give it enough time to download everything and do not be surprised if it feels slow to setup.

## Opening Jupyter Notebook

The setup process should already take you to the container’s logs. If it does not, go to the **Containers** tab. You’ll see your running container there. Click it, then open the **Logs** view.

Scroll through the logs and look for a long line starting with: `http://127.0.0.1:8888/tree?token=`

![Docker container logs](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/docker-container-logs.jpeg?resize=921%2C631&quality=81&ssl=1)

That’s your unique Jupyter link. Click on it in your browser. You’ll see Jupyter’s familiar interface appear. Navigate to the `/notebooks` directory. That’s the folder you connected earlier. Anything you save here will stay on your computer, even after you stop or delete the container.

**Security note:** This token grants full access to your notebooks. Don’t share this URL publicly or commit it to version control.

### Managing Your Container

**To stop the container:** In Docker Desktop, go to **Containers** and click the **Stop** button on your running container.

**To restart next time:** Click the **Run** button on the same container. Your notebooks in the mounted folder will still be there.

**Pro tip.** Your Jupyter token will be different each time you restart. Check the logs for the new URL.

## Verifying TensorFlow

Before we move on, it’s worth confirming that everything works as expected. Create a new Python 3 notebook in Jupyter and paste the following snippet in the empty cell:

```python
import sys
import tensorflow as tf

print(sys.version())
print("TensorFlow version:", tf.__version__)
print("Available GPUs:", tf.config.list_physical_devices('GPU'))
```

With the focus on the cell, click **Shift + Enter** to run it. This will print on screen the version of Python and TensorFlow used, and the GPUs detected. If a GPU appears in the list, great — TensorFlow is using your NVIDIA hardware. If not, don’t worry; it’s running on the CPU instead.

**Note**: When you run this code for the first time you might get many warnings in red. You can safely ignore them. Run the same cell again to get rid of them.

Let’s create your first tensor as an additional test. Go to the next cell in your notebook and paste this code:

```python
# Create a simple tensor
hello = tf.constant('Hello, TensorFlow!')
print(hello)

# Do a basic calculation
a = tf.constant(2)
b = tf.constant(3)
print(f"2 + 3 = {a + b}")
```

If you see the output without errors, congratulations—your environment is fully functional!

## It’s Time to Code

You now have a self-contained TensorFlow lab running on your machine. Everything you build inside Jupyter — from notebooks to trained models — stays organized and reproducible. The next time you need to revisit or share your setup, just start the same container, and you’ll be back where you left off.

This environment isn’t just for deep learning experiments. It’s perfect for anyone exploring AI tools and machine learning workflows, whether you’re training CNNs or experimenting with AI-powered features for your projects.

What about you, have you run into Docker issues or TensorFlow setup quirks on your machine? Share your experience in the comments below.
