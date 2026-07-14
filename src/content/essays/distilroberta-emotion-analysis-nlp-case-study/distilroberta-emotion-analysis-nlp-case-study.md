---
title: "DistilRoBERTa Emotion Analysis: NLP Case Study on Steam Reviews"
date: 2025-11-20T15:01:45
updated: 2026-05-13T15:19:13
sticky: false
cornerstone: false
excerpt: "DistilRoBERTa emotion analysis case study: Steam reviews dataset,
  notebook, and plots for real-world NLP sentiment and emotion exploration."
categories:
  - Programming
tags:
  - AI
  - Automation
  - Gaming
  - Python
  - Workflow
coverAlt: "DistilRoBERTa Emotion Analysis: NLP Case Study on Steam Reviews"
originalCover: https://buthonestly.io/wp-content/uploads/2025/11/dbd-steam-reviews-nlp-dataset.jpg
downloads:
  - file: distilroberta-emotion-analysis-dead-by-daylight-case-study.zip
    label: Steam reviews dataset + notebook
---

> [!summary]- Quick Summary
>
> - An NLP sentiment and emotion analysis case study using DistilRoBERTa on 277k Dead by Daylight Steam reviews.
> - Download a reusable **Steam reviews sentiment analysis** notebook and dataset.
> - Walk through the case study with a Jupyter notebook you can reuse for your own projects.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

Dead by Daylight is one of the few games I keep coming back to. Part of it is the design. Part of it is the chaos. And part of it is the community: endlessly opinionated, often very funny, occasionally unbearable, which makes it the perfect playground for a DistilRoBERTa emotion analysis, an NLP sentiment analysis case study built on real Steam reviews instead of a clean benchmark dataset..

At some point I realized I could do something useful with that. Other than [[gaming-made-me-better-leader|learning more about leadership]] that is.

I spend my days in and around machine learning. I spend my evenings getting hooked off gens. Putting those two together felt obvious: build a dataset that is genuinely useful for NLP work **and** says something real about how people talk about Dead by Daylight.

So over the last few days I pulled every English review from the Steam API, from the very first one in 2019 up to November 2025, and turned them into a single CSV you can actually work with. Moreover, I wired up a notebook that runs a DistilRoBERTa sentiment analysis and emotion pipeline over the whole thing.

I’m releasing the dataset together with the notebook I’m using for this essay. You can download both from the **Downloads** section at the end of this essay.

The rest of the essay walks through that notebook as I use it myself: what’s in the data, what we can learn from it, and how different “moods” show up in the language people use.

We’ll start small and descriptive, then slowly move into models. Buckle up, it’s a long ride, but full of inspiration.

## What’s Inside the Dataset

Each row is a single Steam review. The columns you’ll see when you open the file:

- `review` – full, unedited review text
- `sentiment` – `1` if the review is marked as positive on Steam, `0` if negative
- `purchased` – `1` if the reviewer bought the game on Steam
- `received_for_free` – `1` if they got it for free (bundle, promotion, etc.)
- `votes_up` – number of “helpful” votes
- `votes_funny` – number of “funny” votes
- `date_created` – when the review was written (UTC, time omitted)
- `date_updated` – when it was last edited (UTC, time omitted)
- `author_num_games_owned` – how many games are in the Steam library of the author
- `author_num_reviews` – how many reviews the author has written
- `author_playtime_forever` – total author’s playtime in minutes
- `author_playtime_at_review` – author’s playtime in minutes at the time of the review

Everything is English-only. In total: **277,439 reviews**.

We’ll use this dataset to answer questions like:

- How does the general tone of reviews change over time and around big patches?
- How do “new,” “regular,” “veteran,” and “master” players talk differently?
- What’s the relationship between the simple positive/negative label and a more detailed emotional “mood” from a pretrained model?

But first, we need to load the file and make sure it looks sane.

If you don’t have an environment setup already, I explained in another essay [[set-up-tensorflow-docker-jupyter-notebook|how to set one up]]. Instead of using the image from that tutorial, follow the steps but download `quay.io/jupyter/pytorch-notebook:latest`.

Make sure to also the transformers with `pip install transformers` in your Docker terminal.

If you want to follow along with this as an NLP emotion analysis tutorial rather than just a read, you can copy each code block into a Jupyter notebook and run it on your own machine.

Let’s begin.

## Setting up the Notebook for NLP

I like to put all the constants in one place at the top, so there’s a single spot to tweak things later.

We’ll use Hugging Face transformers with PyTorch to run a **DistilRoBERTa emotion analysis** over a large sample of reviews. Not all the imports are relevant immediately but they will be used throughout the case study.

```python
from pathlib import Path
from collections import Counter
import re
import string

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from transformers import AutoTokenizer, AutoModelForSequenceClassification

SEED = 42

DATA_PATH = Path("steam_reviews_381210_english.csv")  # adjust to your filename

NGRAM_SAMPLE_SIZE = 50_000       # for later text analysis
EMOTION_SAMPLE_SIZE = 80_000     # for emotion model comparisons

EMOTION_MODEL_NAME = "j-hartmann/emotion-english-distilroberta-base"

plt.rcParams["figure.figsize"] = (8, 4)
pd.set_option("display.max_colwidth", 200)

np.random.seed(SEED)
torch.manual_seed(SEED)

df = pd.read_csv(DATA_PATH)
df.head()
```

At this point I like to stop and just scroll.

You get a feeling for the raw text, the shape of the timestamps, how big the playtimes can get, and the kind of typos and abbreviations people use. It’s also a good way to catch obvious issues (weird encodings, missing columns, that sort of thing).

## First Quick Checks

Before doing anything clever, I want to answer a few boring questions:

- Did the CSV load correctly?
- Are the types roughly what I expect?
- How are the positive/negative labels distributed?
- How long are these reviews, roughly?

The notebook does that with a small block of code:

```python
# Basic info about columns and types
df.info()
```

By running this code we see the following:

```bash
<class 'pandas.core.frame.DataFrame'>
RangeIndex: 277479 entries, 0 to 277478
Data columns (total 12 columns):
 #   Column                         Non-Null Count   Dtype
---  ------                         --------------   -----
 0   review                         276470 non-null  object
 1   sentiment                      277479 non-null  int64
 2   purchased                      277479 non-null  int64
 3   received_for_free              277479 non-null  int64
 4   votes_up                       277479 non-null  int64
 5   votes_funny                    277479 non-null  int64
 6   date_created                   277479 non-null  object
 7   date_updated                   277479 non-null  object
 8   author_num_games_owned         277479 non-null  int64
 9   author_num_reviews             277479 non-null  int64
 10  author_playtime_forever_min    277479 non-null  int64
 11  author_playtime_at_review_min  277479 non-null  int64
dtypes: int64(9), object(3)
memory usage: 25.4+ MB
```

The notebook reports:

- **277,479 rows** and **12 columns**
- Most columns are integer counts: votes, playtime, number of games, number of reviews
- Three columns are still plain `object`: `review`, `date_created`, `date_updated`

The good news: almost everything is there. The only missing values are in the `review` text itself: **1,009 rows** have a null `review`, which is about **0.36%** of the dataset. That’s small enough that we can safely drop those rows later without feeling guilty.

The dates are stored as strings for now, but they’re clean enough that we can convert them to proper datetimes in one line. The two playtime columns are already in minutes (`author_playtime_forever_min` and `author_playtime_at_review_min`), which makes it easy to bucket players into “new / regular / veteran / master” later.

Memory-wise, the whole thing sits around **25 MB**, so you can open it on a laptop without needing a GPU shrine in the corner of your room. As I am writing this, I am indeed running the code on a MacBook Pro with no external GPU.

I also like to look at how long the reviews are, just to set expectations. The notebook adds a simple `text_len` column and runs:

```python
# Text length distribution
df["text_len"] = df["review"].astype(str).str.len()
df["text_len"].describe()
```

The `text_len` summary comes back with:

```bash
count    277479.000000
mean        157.870722
std         448.160816
min           1.000000
25%          11.000000
50%          36.000000
75%         113.000000
max        8000.000000
Name: text_len, dtype: float64
```

- **count**: 277,479 reviews
- **mean length**: about **158 characters**
- **median**: **36 characters**
- **75th percentile**: **113 characters**
- **maximum**: **8,000 characters**

So most people write something short and to the point, but there’s a long tail of full-on essays that go into several thousand characters. The median being 36 characters means that a typical review is closer to “fun with friends” than to a balance manifesto, but those manifestos are absolutely there, and they drag the average up.

In other words, the distribution looks exactly like you’d expect from Steam. Lots of quick emotional hits, with occasional walls of text when someone finally snaps.

### Steam’s Thumbs-Up Bias

Once the basic structure looked sane, I wanted to know something simple:

_How many of these reviews are actually marked as positive vs negative?_

The `sentiment` column is a numeric label:

- `1` → thumbs up
- `0` → thumbs down

```python
sentiment_counts = df["sentiment"].value_counts().sort_index()
sentiment_share = df["sentiment"].value_counts(normalize=True).sort_index()

sentiment_counts, sentiment_share
```

When I ask the notebook for counts and proportions, it comes back with:

- **19.7% negative** reviews
- **80.3% positive** reviews

```bash
(sentiment
 0     54777
 1    222702
 Name: count, dtype: int64,
 sentiment
 0    0.19741
 1    0.80259
 Name: proportion, dtype: float64)
```

So about four out of five reviews in this dataset are technically “positive.”

That doesn’t mean four out of five reviews are _happy_.

If you’ve read Steam reviews before, you know how this works: people will mark a review as positive while writing a long, exhausted critique that ends with “I still recommend it though.” Or they’ll thumbs up a game because they have 2,000 hours in it and a complicated relationship with it.

Still, this 80/20 split matters:

- It tells us the dataset is very skewed towards positives, so any model trained directly on this label will inherit that bias.
- It gives us a baseline to compare against later when we bring in a separate “mood” label from a pretrained emotion model.
- It also says something about the game itself: people complain loudly, but a big majority still clicks “recommend.” This reflects my personal experience in the game and its subreddit.

For now, we’ll treat `sentiment` as “what the player decided to tell Steam about their overall recommendation” and keep in the back of our heads that the actual emotional tone might be very different.

Later on, we’ll look at where those two disagree.

### Timeframe: Six Years of People Having Feelings

The next question for the notebook is, “When are these reviews from?”

We convert `date_created` to a proper datetime and ask for the minimum and maximum.

```python
# Date range
df["date_created"] = pd.to_datetime(df["date_created"])
date_range = df["date_created"].agg(["min", "max"])
date_range
```

The answer is:

- **earliest review**: 2019-07-04
- **latest review**: 2025-11-09

So the dataset covers a bit more than **six years** of _Dead by Daylight_’s life.

```bash
min   2019-07-04
max   2025-11-09
Name: date_created, dtype: datetime64[ns]
```

That’s roughly:

- Dozens of chapters and mid-chapters releases
- A long list of killers and survivors introduced into the roster
- Multiple balance passes, reworks, events, and seasonal spikes

In other words, this is not a snapshot around a single patch. It’s a rolling diary of how people have been talking about the game, in public, for more than half a decade.

That’s useful for two reasons:

1.  **We can look at trends**, not just static aggregates: how the share of positive reviews changes over time, where it spikes or crashes.
2.  **We can line it up with the game’s own history**: new killer releases, big systems changes, anniversary events — all the stuff you see in the [patch notes and on the wiki](https://deadbydaylight.wiki.gg/wiki/Patches).

We already knew the collection window was “2019 to November 2025” from the description, but it’s nice to see that the actual data matches the promise.

### Monthly Volume and Mood

Once we know the overall time window, it’s worth zooming in a bit, “_How many reviews do we get each month, and how positive are they?_”

```python
df["year_month"] = df["date_created"].dt.to_period("M").dt.to_timestamp()

monthly = (
    df.groupby("year_month")
      .agg(
          review_count=("review", "size"),
          share_positive=("sentiment", "mean"),
      )
      .reset_index()
)

monthly.tail(), monthly.head()
```

When I bucket by month, two things stand out immediately.

```bash
(   year_month  review_count  share_positive
 72 2025-07-01          6294        0.806006
 73 2025-08-01          5321        0.709641
 74 2025-09-01          3764        0.642402
 75 2025-10-01          3691        0.719859
 76 2025-11-01           963        0.703011,
   year_month  review_count  share_positive
 0 2019-07-01          2186        0.828454
 1 2019-08-01           803        0.699875
 2 2019-09-01          1225        0.728163
 3 2019-10-01          2084        0.820537
 4 2019-11-01          6585        0.867882)
```

On the **early side** of the dataset:

- July 2019: **2,186** reviews, about **82.8%** positive
- August 2019: **803** reviews, ~**70.0%** positive
- October 2019: **2,084** reviews, ~**82.1%** positive
- November 2019: **6,585** reviews, ~**86.8%** positive

So even at the very start, the volume already moves a lot from month to month, and the positivity rate swings between roughly 70% and almost 87%. November 2019 in particular looks like a spike: many more reviews and a very high share of “recommend” clicks.

Fast forward to the **most recent months** we have:

- July 2025: **6,294** reviews, ~**80.6%** positive
- August 2025: **5,321** reviews, ~**71.0%** positive
- September 2025: **3,764** reviews, ~**64.2%** positive
- October 2025: **3,691** reviews, ~**72.0%** positive
- November 2025: **963** reviews, ~**70.3%** positive (partial month)

The pattern feels familiar if you’ve played the game for a while:

- Large spikes in volume around certain moments (new content, events, drama).
- Noticeable dips in positivity that slowly recover, but not always back to previous levels.

July 2025 looks pretty healthy, then positivity drops by more than 16 percentage points over the next two months before recovering a bit in October. Without context, that’s just a curve. Once we line it up with patch notes and new killer/survivor releases, it becomes a story.

I’ll come back to that later using the patch log. For now, the important part is this:

- The dataset isn’t just “a big bag of reviews.”
- It’s a **time series** with clear swings in volume and mood that we can relate to what the game was doing at the time.

### Who’s Talking: Playtime at Review

Steam reviews are more interesting when you know _who_ is writing them.

Someone with five hours in the game and someone with two thousand hours are technically leaving the same kind of review, but they live in completely different realities.

To get a rough sense of that, I looked at the distribution of `author_playtime_at_review_min` — the number of minutes played at the moment the review was written.

```python
playtime_desc = df["author_playtime_at_review_min"].describe()
playtime_quantiles = df["author_playtime_at_review_min"].quantile([0.25, 0.5, 0.75, 0.9, 0.99])

playtime_desc
playtime_quantiles
```

The key quantiles look like this:

```bash
0.25      1021.00
0.50      4462.00
0.75     18112.50
0.90     50459.20
0.99    170344.44
Name: author_playtime_at_review_min, dtype: float64
```

- 25th percentile: **1,021 minutes** (~**17 hours**)
- 50th percentile (median): **4,462 minutes** (~**74 hours**)
- 75th percentile: **18,112.5 minutes** (~**302 hours**)
- 90th percentile: **50,459.2 minutes** (~**841 hours**)
- 99th percentile: **170,344.4 minutes** (~**2,839 hours**)

So:

- A **typical reviewer** has already put around **70–80 hours** into the game.
- A quarter of reviewers are under ~17 hours: fresh-ish impressions, still figuring out how anything works.
- At the high end, there’s a long, heavy tail of people with **hundreds or thousands of hours**. That’s the “I main this killer and I have opinions” crowd.

This supports the intuition that we shouldn’t treat all reviews as coming from the same kind of player. A new survivor complaining about the learning curve and a master killer complaining about MMR are both valid, but not interchangeable.

### Four Kinds of Players

To make this more concrete, I’ll group players into four experience bands based on playtime at the time of review:

- **new** – under **100 hours** (< 6,000 minutes)
- **regular** – **100–500 hours** (6,000–30,000 minutes)
- **veteran** – **500–2,000 hours** (30,000–120,000 minutes)
- **master** – over **2,000 hours** (> 120,000 minutes)

These thresholds aren’t magical; they’re just a simple way to turn a huge numeric range into four buckets that roughly match how the game feels at different stages. We’ll use them later to see how language and sentiment shift as people stick around.

```python
def label_experience(minutes: float) -> str:
    """Bucket players by minutes played at review time."""
    if minutes < 100 * 60:
        return "new"
    elif minutes < 500 * 60:
        return "regular"
    elif minutes < 2_000 * 60:
        return "veteran"
    else:
        return "master"

df["experience"] = df["author_playtime_at_review_min"].fillna(0).apply(label_experience)

experience_counts = df["experience"].value_counts().sort_index()
experience_counts
```

When I apply that to `author_playtime_at_review_min`, the dataset breaks down like this:

```bash
experience
master       6099
new        153318
regular     77292
veteran     40770
Name: count, dtype: int64
```

- **new** → about **55%** of all reviews
- **regular** → about **28%**
- **veteran** → about **15%**
- **master** → about **2%**

So the picture really is a pyramid:

- More than half of the reviews come from people with **less than 100 hours** in the game.
- Roughly a third come from the middle: people who’ve played somewhere between **100 and 500 hours**.
- A solid chunk, almost **41k reviews**, are from veterans with **500–2,000 hours** behind them.
- And then there’s the tiny top of the triangle: a bit over **6,000 reviews** from people with more than **2,000 hours**.

For Dead by Daylight, this feels right.

New players are loud because everything is confusing, unfair, and stressful in a way you haven’t learned to enjoy yet. Regulars are in the “I basically know what’s happening but I still have hope” zone. Veterans talk like people who have seen several metas rise and die. Masters sound like they live there.

The nice part is: the dataset contains all four voices, and we can now treat them separately instead of pretending there’s just one “average” player.

Later on, we’ll use these bands to ask questions like:

- How positive vs. negative are reviews in each group?
- What do new players complain about that masters don’t even mention anymore?
- Where does the language become more technical, more specific, or more resigned?

For now, it’s enough to know that the CSV doesn’t just have a lot of reviews — it has a lot of reviews from people at very different stages of their relationship with the game.

### How Positivity Changes with Experience

Now that the reviews are split into new / regular / veteran / master, the next question is obvious: “_Does the chance of recommending the game change as people spend more time in it?_”

```python
sentiment_by_experience = (
    df.groupby("experience")["sentiment"]
      .mean()
      .sort_index()
)

sentiment_by_experience
```

When I ask the notebook for the average `sentiment` (0/1) inside each group, it comes back with:

```bash
experience
master     0.544679
new        0.863512
regular    0.773314
veteran    0.667574
Name: sentiment, dtype: float64
```

- New players are **~86% positive**.
- Regulars are **~77% positive**.
- Veterans are **~67% positive**.
- Masters are **~54% positive**.

That’s almost a straight slope down.

You can read this a few ways:

- There’s a clear **honeymoon phase**: under 100 hours, most people still hit “recommend” even if they have complaints.
- Between 100 and 500 hours, positivity drops by about **nine points**. Maybe this is where the novelty wears off and the grind, meta and matchmaking start to bite.
- Veterans (500–2,000 hours) are still mostly positive, but the split is closer to **two-thirds / one-third**. At that point, you’ve seen a few metas and probably lived through at least one patch you hated.
- Masters (2,000+ hours) are basically **coin flip territory**. Slightly more than half still recommend the game, but a massive chunk doesn’t.

This is precisely why I wanted playtime in the dataset. A global “80% positive” hides the fact that the shape is:

> very happy → still happy → conflicted → deeply ambivalent

Later, when we look at the language itself, we’ll see _how_ this shift shows up: whether masters use more technical jargon, more specific complaints, more sarcasm, or simply sound tired.

For now, the important bit is: **sentiment is not uniform across experience**. Any model or analysis that ignores that is flattening something interesting.

### What Happy vs. Unhappy Players Actually Say (at a Glance)

With a bit of light cleaning (lowercasing, stripping punctuation, removing stopwords), I asked a simple question:

“_What are the most common words in positive reviews and in negative ones?_”

```python
PUNCTUATION = set(string.punctuation)
STOPWORDS = ENGLISH_STOP_WORDS

def tokenize(text: str) -> list[str]:
    text = str(text).lower()
    # keep only letters and apostrophes
    tokens = re.findall(r"[a-z']+", text)
    return [t for t in tokens if t not in STOPWORDS and len(t) > 2]

def top_ngrams(texts, n: int = 1, top_k: int = 30):
    counter = Counter()
    for text in texts:
        tokens = tokenize(text)
        for i in range(len(tokens) - n + 1):
            ngram = " ".join(tokens[i:i + n])
            counter[ngram] += 1
    return counter.most_common(top_k)

pos_mask = df["sentiment"] == 1
neg_mask = df["sentiment"] == 0

pos_n = min(NGRAM_SAMPLE_SIZE, pos_mask.sum())
neg_n = min(NGRAM_SAMPLE_SIZE, neg_mask.sum())

pos_sample = df.loc[pos_mask, "review"].sample(pos_n, random_state=SEED)
neg_sample = df.loc[neg_mask, "review"].sample(neg_n, random_state=SEED)

top_pos_uni = top_ngrams(pos_sample, n=1, top_k=20)
top_neg_uni = top_ngrams(neg_sample, n=1, top_k=20)

top_pos_uni, top_neg_uni
```

On the **positive** side, the top unigrams look like this:

- `game`, `fun`, `good`, `play`, `great`
- `friends`, `love`, `time`, `really`
- `killer`, `killers`, `survivor`, `survivors`
- `recommend`

```bash
[('game', 36588),  ('fun', 14520),  ('good', 9308),
('play', 8910),  ('killer', 6107),  ('friends', 5397),
('like', 5301),  ("it's", 4412),  ('great', 4210),
('just', 4163),  ('playing', 4144),  ('love', 4005),
('time', 3404),  ('killers', 3301),  ('really', 3271),
('survivor', 3125),  ('survivors', 2863),  ('games', 2453),
('people', 2375),  ('recommend', 2268)]
```

So the picture is:

- Lots of “fun”, “good”, “great”, “love”.
- Social play shows up directly: “friends”.
- Role words are present but not dominant — killers and survivors are part of the experience, not the whole story.
- The word “recommend” is explicitly there, which fits the thumbs-up label.

On the **negative** side, the list is different but not _completely_ different:

- `game`, `killer`, `play`, `fun`, `killers`
- `like`, `time`, `survivor`, `survivors`
- `new`, `perks`, `players`, `devs`, `people`, `community`
- `"don't"`

```bash
[('game', 84917),  ('killer', 20369),  ('play', 20246),
('just', 16706),  ('fun', 13593),  ('killers', 12978),
('like', 12181),  ('time', 10737),  ('survivor', 10283),
('survivors', 10214),  ("don't", 9850),  ('playing', 9805),
("it's", 9493),  ('new', 8038),  ('perks', 8002),
('good', 7583),  ('players', 7539),  ('devs', 7504),
('people', 7181),  ('community', 6440)]
```

The overlap is almost the point:

- `game`, `killer`, `play`, `fun` appear in both lists.
- People talk about _the same objects_ whether they like the game or not: killers, survivors, perks, and the community.

What changes is the **frame**:

- Positive reviews lean on **affect** and **social context**: fun, good, great, friends, love, recommend.
- Negative reviews bring in **friction** and **targets**: new players, perks, devs, community, “don’t”.

You can already see a few classic Dead by Daylight tensions bubbling up:

- “Fun” appears high on both sides — which often means “this _could_ be fun, but…”
- `devs` and `community` show up only in the negative top-20, not the positive one. When people are happy, they talk about matches. When they’re upset, they talk about _other people_.
- `perks` only appears in negative reviews: people mostly bring them up when they feel something is unfair or broken.

This is still very crude: just word counts, no context, no sense of who is speaking (new vs. master). But it already confirms that:

1.  Positive vs. negative reviews are _about_ the same game.
2.  The difference lives in how people _relate_ to those same elements.

Later, we’ll repeat this kind of analysis inside each experience band and also per “mood” label from the emotion model to see how anger vs. disappointment vs. joy shapes the vocabulary.

For now, it’s enough to know that we’re looking at the right kind of mess: people arguing about killers, perks, other players, and the devs.

### Short Phrases, Long Stories

Unigrams tell us _what_ people talk about. Bigrams start to show _how_ they talk about it.

```python
top_pos_bi = top_ngrams(pos_sample, n=2, top_k=20)
top_neg_bi = top_ngrams(neg_sample, n=2, top_k=20)

top_pos_bi, top_neg_bi
```

When I look at the top two-word phrases in positive reviews, I get things like:

- `good game`, `great game`, `fun game`, `best game`
- `play friends`, `fun friends`
- `game fun`, `fun play`, `really fun`, `fun haha`, `haha fun`
- `love game`, `pretty good`
- `dead daylight`, `nea nea`

It’s very on the nose:

- Straight-up endorsements (`good game`, `great game`, `best game`).
- Social context again: having fun **with friends** is a recurring pattern.
- Several variations on “fun”
- And wonderfully specific artifacts like `nea nea`, which is exactly the kind of thing you only get in a real community dataset. Knowing the game, this is probably something like “nea be nea”.

One interesting outlier: `hate game` appears in the positive list. That’s the classic “I hate this game but I love it” energy — something we’ll probably see more clearly when we add emotion labels.

On the negative side, the top bigrams look different:

- `play game`, `playing game`, `buy game`, `hours game`, `bad game`
- `play killer`, `playing killer`, `play survivor`
- `new players`
- `recommend game`
- `tunnel tunnel`
- `game just`, `game game`, `game fun`, `good game`, `fun game`

A few things stand out:

- `buy game` and `hours game` point straight at value: “I paid for this” and “I have X hours in this game” are how many negative reviews start.
- `new players` shows up here but not in the positive bigrams. People mention new players when they’re upset (about matchmaking, smurfs, or teammates), not when they’re happy.
- `tunnel tunnel` appearing in the top-20 negative phrases is the most Dead by Daylight thing possible. You can basically hear the salt.
- `recommend game`, `good game`, and `fun game` also show up in negative reviews, which suggests a lot of “I recommend this game but…” or “good game ruined by…” type reviews.

The overlap is again important:

- Both sides use `play game`, `fun game`, `good game`, `game fun`.
- The big difference is in the _surrounding frame_: value, time invested, specific frustrations (`tunnel tunnel`, `new players`) and a lot of “I want to play but…”

This is why I like starting with simple counts. Without any model, we’re already seeing:

- Social vs. value vs. design complaints.
- Community jargon showing up naturally.
- The classic DBD contradiction: “good game, fun game, I hate it.”

Later, we can formalize this with topic models or more structured features, but the basic texture is already on the page.

## Patches as Emotional Landmarks

So far we’ve looked at the reviews as if they existed in a vacuum.

We’ve seen:

- How often people recommend the game.
- How that recommendation rate changes with playtime.
- What happy and unhappy players talk about, down to little phrases and in-jokes.

But Dead by Daylight doesn’t live in a vacuum. The game is constantly changing: new killers, new survivors, perk reworks, map updates, mid-chapter tweaks, and hotfixes for whatever broke last week.

If you’ve played for any amount of time, you know the rhythm: patch notes drop, and the community mood swings hard in one direction or another.

To bring that into the analysis, I took the official patch history from the wiki and turned it into a small CSV that ships with the dataset (available in the download). It’s intentionally simple:

- `version` – things like `8.0.0`, `9.1.0`, `7.3.2`
- `date` – the release date

That’s it. No full changelog, no walls of text. Just enough to put a few vertical lines on the same timeline as the reviews.

From there, I divide patches into three rough categories:

- **Major** – versions like `8.0.0`, `9.0.0`
  - Big chapter drops. New killers, survivors, and maps. The things that change how the game _feels_.
- **Minor** – versions like `9.1.0`, `9.2.0`
  - Seasonal characters, new perks, and noticeable balance changes. Still important, but smaller in scope.
- **Patch** – everything else (`7.3.2`, `7.3.3`, etc.)
  - Hotfixes, small tuning passes, bug fixes.

The rule is simple:

- If a version ends in **`.0.0`**, I treat it as **major**.
- If it ends in **`.0`** but not `.0.0`, it’s **minor**.
- Otherwise, it’s a regular **patch**.

It’s not perfect, but it matches how the game tends to move:

- Major versions shake the meta and bring people back.
- Minor versions nudge things and sometimes quietly fix long-running pain points.
- Patches keep the whole thing from falling apart.

Once everything has a `patch_type` and a `date`, I can bucket patches by month and put them next to the `share_positive` curve we saw earlier. The result is a sort of emotional ECG:

- Calm stretches of “just patches.”
- Sharp spikes of attention (and opinion) around big chapters.
- Occasional dips where a major or minor update lands badly and the reviews immediately get saltier.

In the notebook, I’m not trying to prove that any specific patch “caused” a change in sentiment. I’m doing something smaller and more honest: lining up **when** the game changed with **how** people talked about it and using that as context for the rest of the analysis.

From here, we have three dimensions to play with:

- **Time** – when reviews were written and what the game looked like then.
- **Experience** – how many hours the reviewer had at that moment.
- **Language and mood** – what they said and how it sounded.

The last piece we haven’t touched yet is mood. The Steam label tells us whether someone clicked “recommend”. It doesn’t tell us _how_ they felt when they wrote the review.

That’s what we’ll tackle next: using a pretrained model to tag each review with an emotional label (angry, joyful, etc.) and then comparing that to the thumbs up / thumbs down we’ve been using so far.

### How Often the Game “Really” Changes

Let’s load the patches CSV and have a glance at it.

```python
# Load patches
patches = pd.read_csv("dbd_patches.csv", parse_dates=["date"])

def patch_type_from_version(v: str) -> str:
    v = str(v)
    parts = v.split(".")
    if len(parts) != 3:
        return "other"
    major, minor, patch = parts
    if minor == "0" and patch == "0":
        return "major"
    elif patch == "0":
        return "minor"
    else:
        return "patch"

patches["patch_type"] = patches["version"].apply(patch_type_from_version)

# Align to year-month for joining with reviews
patches["year_month"] = patches["date"].dt.to_period("M").dt.to_timestamp()

# Quick sanity check: how many of each type?
patches["patch_type"].value_counts(), patches.head()
```

Once every version in the patch CSV is tagged, the breakdown looks like this:

```bash
(patch_type
 patch    231
 minor     59
 major      8
 Name: count, dtype: int64,
   version       date patch_type year_month
 0  1.0.1a 2016-06-22      patch 2016-06-01
 1   1.0.2 2016-06-29      patch 2016-06-01
 2  1.0.2a 2016-06-30      patch 2016-06-01
 3  1.0.2b 2016-06-30      patch 2016-06-01
 4  1.0.2c 2016-06-30      patch 2016-06-01)
```

- **231** entries tagged as `patch`
- **59** as `minor`
- **8** as `major`

So most of the time, _Dead by Daylight_ is in **maintenance mode**:

- Lots of small patches: hotfixes, bugfixes, small balance tweaks.
- A smaller, but still regular, cadence of minor updates.
- Only a handful of truly big “chapter-level” changes over the whole history in the CSV.

The head of the table looks like:

- `1.0.1a` – 2016-06-22 – `patch`
- `1.0.2` – 2016-06-29 – `patch`
- `1.0.2a/b/c` – all `patch` entries in late June 2016

So the patch file is really the **full historical record**, going back to 2016, while our reviews start in mid-2019. When we line these up with the review data, we’ll only keep the part of the patch history that overlaps with the review window.

That gives us a nice view of the game’s “heartbeat” during the years covered by the dataset:

- Long stretches where only small patches land.
- Occasional minor updates that add characters or perks.
- Rare major drops that bring a full chapter and usually a big wave of opinions.

On the sentiment chart, majors and minors become **landmarks**:

- If a big chapter lands and the share of positive reviews drops the following month, that’s a strong hint that people didn’t like something about it.
- If a minor update lands and sentiment gently climbs, it might be fixing pain points or quietly smoothing the meta.
- If nothing big happens but positivity still moves, it suggests more systemic factors (or outside events) at play.

Again, this isn’t about proving causality. It’s about reading reviews with context: knowing what the game looked like when people were writing those angry or happy paragraphs.

### How Often the Game Pokes the Community

We already looked at monthly reviews on their own:

- July 2019: **2,186** reviews, **82.8%** positive
- August 2019: **803** reviews, **70.0%** positive
- September 2019: **1,225** reviews, **72.8%** positive
- October 2019: **2,084** reviews, **82.1%** positive
- November 2019: **6,585** reviews, **86.8%** positive

Even without context, you can see the game breathing:

- Some months are relatively quiet, with under a thousand reviews.
- Others spike hard (November 2019 is a big one) and are also very positive.

Once we pull the patch CSV in and count how many **major**, **minor**, and **patch** releases landed in each month, the picture gets more interesting.

```python
# Keep only patches that overlap the review window
start_month = df["year_month"].min()
end_month = df["year_month"].max()

patches_window = patches[
    (patches["year_month"] >= start_month)
    & (patches["year_month"] <= end_month)
].copy()

# Count patch types per month
patch_summary = (
    patches_window
    .groupby(["year_month", "patch_type"])["version"]
    .count()
    .unstack(fill_value=0)
    .reset_index()
)

# Merge with monthly review stats
monthly_with_patches = monthly.merge(patch_summary, on="year_month", how="left")

for col in ["major", "minor", "patch"]:
    if col in monthly_with_patches.columns:
        monthly_with_patches[col] = monthly_with_patches[col].fillna(0)

monthly_with_patches.head()
```

|     | **year\_month** | **review\_count** | **share\_positive** | major | minor | patch |
| --- | --------------- | ----------------- | ------------------- | ----- | ----- | ----- |
| 0   | 2019-07-01      | 2186              | 0.828454            | 0.0   | 1.0   | 2.0   |
| 1   | 2019-08-01      | 803               | 0.699875            | 0.0   | 0.0   | 1.0   |
| 2   | 2019-09-01      | 1225              | 0.728163            | 0.0   | 1.0   | 1.0   |
| 3   | 2019-10-01      | 2084              | 0.820537            | 0.0   | 0.0   | 2.0   |
| 4   | 2019-11-01      | 6585              | 0.867882            | 0.0   | 0.0   | 1.0   |

A few things pop out immediately:

- There’s a **steady drip of patches** in the background: one or two most months, occasionally more.
- Minors are less frequent but visible: July and September each have a **minor + patches** combo.
- Spikes in review volume (like November 2019) don’t always line up with lots of patch entries; sometimes one well-timed update or event is enough to get people talking.

This is exactly why I wanted the patch CSV: it lets us talk about review mood with a bit more context than “the game changed somehow.”

If you zoom this out across the whole 2019–2025 window, you end up with a monthly timeline where each point knows:

- How many reviews happened.
- What fraction of them were positive.
- How many major, minor, and patch releases landed that month.

From here, you can start asking questions like:

- Do major updates tend to be followed by a drop in recommendation rate, or a bump?
- Are there months with **no** major/minor updates where sentiment still swings hard?
- Do we see any “recovery” months where a patch after a rough release calms people down?

In the essay, I don’t try to do serious causal analysis with this — that would need more care than a blog post deserves. But I do want readers to see that the dataset isn’t just random text: it’s reviews anchored to a clear patch history, and you can use that to frame your own questions.

## The Emotional Weather of Patches

Let’s plot the sentiment and take a closer look at monthly reviews and patches.

```python
# Plot monthly positivity, volume, and patch markers
fig, ax1 = plt.subplots(figsize=(10, 4))

# Positivity line
ax1.plot(
    monthly_with_patches["year_month"],
    monthly_with_patches["share_positive"],
    label="Share positive",
)
ax1.set_xlabel("Month")
ax1.set_ylabel("Share positive")

# Review volume as bars on second axis
ax2 = ax1.twinx()
ax2.bar(
    monthly_with_patches["year_month"],
    monthly_with_patches["review_count"],
    alpha=0.3,
    label="Review count",
)
ax2.set_ylabel("Number of reviews")

# Mark major and minor patches on the positivity line
major_mask = monthly_with_patches["major"] > 0
minor_mask = monthly_with_patches["minor"] > 0

ax1.scatter(
    monthly_with_patches.loc[major_mask, "year_month"],
    monthly_with_patches.loc[major_mask, "share_positive"],
    s=60,
    marker="o",
    label="Major patch month",
)

ax1.scatter(
    monthly_with_patches.loc[minor_mask, "year_month"],
    monthly_with_patches.loc[minor_mask, "share_positive"],
    s=40,
    marker="x",
    label="Minor patch month",
)

ax1.tick_params(axis="x", rotation=45)
ax1.set_title("Positivity, Volume, and Patches Over Time")

handles1, labels1 = ax1.get_legend_handles_labels()
handles2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(handles1 + handles2, labels1 + labels2, loc="best")

fig.tight_layout()
plt.show()
```

![Steam reviews sentiment analysis over time vs. game patches](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/dbd-reviews-nlp-sentiment-plot.jpg?resize=829%2C324&quality=81&ssl=1)

With everything on the same chart — positivity line, review volume bars, circles for major patches and crosses for minor ones — the review history of Dead by Daylight suddenly looks like weather.

A few patterns jump out.

### The Big June Chapters Are Loud, But Not Disasters

The **major patches** (the blue dots) all land in June:

- 2020-06 → 0.86 positive, ~5.6k reviews
- 2021-06 → 0.83 positive, ~6.0k reviews
- 2022-06 → 0.83 positive, ~4.3k reviews
- 2023-06 → 0.79 positive, ~2.8k reviews
- 2024-06 → 0.78 positive, ~3.0k reviews
- 2025-06 → 0.81 positive, ~6.2k reviews

These are big chapter drops, and you can see that in the **volume**: every June is a relatively busy month.

|     | **year\_month** | **review\_count** | **share\_positive** | major | minor | patch |
| --- | --------------- | ----------------- | ------------------- | ----- | ----- | ----- |
| 0   | 2020-06-01      | 5597              | 0.859389            | 1.0   | 0.0   | 0.0   |
| 1   | 2021-06-01      | 5967              | 0.825708            | 1.0   | 0.0   | 2.0   |
| 2   | 2022-06-01      | 4306              | 0.829540            | 1.0   | 0.0   | 2.0   |
| 3   | 2023-06-01      | 2787              | 0.793685            | 1.0   | 0.0   | 2.0   |
| 4   | 2024-06-01      | 2963              | 0.783665            | 1.0   | 0.0   | 2.0   |
| 5   | 2025-06-01      | 6195              | 0.805165            | 1.0   | 0.0   | 1.0   |

But they’re not followed by catastrophic drops in recommendation rate. If anything, they sit slightly **above** or around the local baseline:

- Early years: majors in the mid-80% range.
- Later years: majors still in the high-70s to low-80s.

So the “huge chapter ruined the game” narrative doesn’t show up as a massive post-June crater in this metric. People have complaints, but they mostly still click **recommend** around those updates.

### The Nastiest Dips Come With Minors, Not Majors

The low points on the line are mostly **minor patch months** (orange crosses), not majors.

|     | **year\_month** | **review\_count** | **share\_positive** | **major** | **minor** | **patch** |
| --- | --------------- | ----------------- | ------------------- | --------- | --------- | --------- |
| 0   | 2019-07-01      | 2186              | 0.828454            | 0.0       | 1.0       | 2.0       |
| 1   | 2019-09-01      | 1225              | 0.728163            | 0.0       | 1.0       | 1.0       |
| 2   | 2019-12-01      | 4384              | 0.866104            | 0.0       | 1.0       | 2.0       |
| 3   | 2020-01-01      | 4026              | 0.846746            | 0.0       | 1.0       | 1.0       |
| …   | …               | …                 | …                   | …         | …         | …         |
| 40  | 2025-05-01      | 3095              | 0.799031            | 0.0       | 1.0       | 2.0       |
| 41  | 2025-07-01      | 6294              | 0.806006            | 0.0       | 1.0       | 1.0       |
| 42  | 2025-09-01      | 3764              | 0.642402            | 0.0       | 1.0       | 1.0       |

A few that stand out:

- **2021-02** – minor + patches, **65.3%** positive
- **2023-03** – minor + patches, **70.5%** positive
- **2023-04** – minor only, **65.0%** positive
- **2025-01** – minor only, **63.0%** positive
- **2025-09** – minor + patch, **64.2%** positive

These are some of the worst months in the whole timeline, and they’re not the big June chapters — they’re smaller updates earlier or later in the year.

It fits the vibe of live-service games: big content drops bring people in and generally feel exciting, even if they’re messy. The stuff that really grinds people down is often the smaller balance passes and system tweaks that land when everyone is already a bit tired.

At the same time, not every minor is bad news:

- **2019-12** – minor + patches, **86.6%** positive
- **2020-07** – minor + patch, **87.2%** positive
- **2023-11** – minor + patch, **87.7%** positive

So minors are more like **inflection points** than automatically cursed months. Some of them kick off a bad era; others feel like “finally, they fixed X.”

### A Gentle Drift Downwards

If you look at the whole line from 2019 to 2025, there’s a slow, noisy drift from:

- high-80s / low-80s  
  to
- mid-70s, sometimes dipping into the mid-60s.

The big June majors track that drift: still relatively high, but clearly lower in later years than in 2019–2020.

Given what we saw earlier about **experience bands** (new players super positive, masters barely above 50/50), this isn’t shocking. Over time, the player base that sticks around becomes more critical, and the game accumulates design debt and history.

The point isn’t to say “Dead by Daylight is dying”. It’s more:

> “Across six years of reviews, the emotional baseline slowly slides from ‘this is amazing’ toward ‘this is complicated’.”

The nice part is that, thanks to the patch CSV, that slide isn’t just a vague impression. You have concrete dates and versions you can anchor it to if you want to dig deeper.

## Mood vs. Recommendation: DistilRoBERTa Emotion Analysis

Up to now, we’ve treated Steam’s `sentiment` column as our ground truth:

- `1` → thumbs up
- `0` → thumbs down

That tells us whether someone _recommends_ the game, but not how they _feel_ while writing the review.

You can already see the gap in the text:

- Positive reviews that contain “I hate this game” in the middle of a rant.
- Negative reviews that sound more tired than angry.
- A lot of sarcastic “good game btw” energy.

To get a more nuanced picture, I added a second label: an approximate **mood** for each review.

```python
tokenizer = AutoTokenizer.from_pretrained(EMOTION_MODEL_NAME)
emotion_model = AutoModelForSequenceClassification.from_pretrained(EMOTION_MODEL_NAME)
emotion_model.eval()

emotion_labels = emotion_model.config.id2label
emotion_labels
```

Instead of building that from scratch, the notebook uses a pretrained emotion classifier — a DistilRoBERTa model fine-tuned on English emotions. It maps each review to one of seven classes:

- `anger`
- `disgust`
- `fear`
- `joy`
- `neutral`
- `sadness`
- `surprise`

Under the hood, this is just a small Transformer model from the `transformers` library, running with a PyTorch backend. [[set-up-tensorflow-docker-jupyter-notebook|Depending on your environment]], you may need to install a couple of extra packages first: `pip install transformers`

Once that’s in place, the code does something very simple:

1.  Take a sample of reviews (we don’t need all 277k to see the pattern).
2.  Run them through the emotion model in batches.
3.  Attach the predicted `emotion` label to each sampled review.
4.  Compare this new label with the Steam `sentiment` column.

This gives us a little 2D view of the data:

- One axis is **“Do you recommend the game?”**
- The other is **“What mood is this text in?”**

From there, we can ask questions like:

- How many reviews are technically positive but written in clear `anger` or `sadness`?
- What does `joy` look like in language compared to `neutral` or `surprise`?
- Are `anger` reviews mostly coming from veterans and masters, or is everyone mad?

We’ll treat this mood label as approximate — the model isn’t perfect, and sarcasm is hard — but it’s still a lot more expressive than a binary thumb.

### What Moods People Write In

Once the emotion model runs over a big sample of reviews, it gives us a second label per text.

```python
text_col = "review"  # using the raw review text

# Make sure we only sample from non-empty text
df_for_emotion = df[
    df[text_col].notna()
    & (df[text_col].astype(str).str.strip() != "")
].copy()
df_for_emotion["label"] = df_for_emotion["sentiment"].map({1: "positive", 0: "negative"})

def batched(iterable, batch_size: int):
    batch = []
    for item in iterable:
        batch.append(item)
        if len(batch) == batch_size:
            yield batch
            batch = []
    if batch:
        yield batch

def predict_emotions(texts, batch_size: int = 32, max_len: int = 256):
    all_labels = []
    for batch in batched(texts, batch_size):
        batch_str = [str(t) for t in batch]
        enc = tokenizer(
            batch_str,
            padding=True,
            truncation=True,
            max_length=max_len,
            return_tensors="pt",
        )
        with torch.no_grad():
            outputs = emotion_model(
                input_ids=enc["input_ids"],
                attention_mask=enc["attention_mask"],
            )
            probs = torch.softmax(outputs.logits, dim=-1).cpu().numpy()
        preds = probs.argmax(axis=-1)
        all_labels.extend(preds)
    return [emotion_labels[int(i)] for i in all_labels]

emotion_sample = df_for_emotion.sample(EMOTION_SAMPLE_SIZE, random_state=SEED).copy()
emotion_sample["emotion"] = predict_emotions(emotion_sample[text_col])

emotion_dist = emotion_sample["emotion"].value_counts(normalize=True)
emotion_dist
```

On 80,000 randomly sampled reviews, the distribution looks like this:

- **joy** – ~**32.7%**
- **neutral** – ~**31.4%**
- **sadness** – ~**9.1%**
- **disgust** – ~**8.9%**
- **anger** – ~**8.8%**
- **fear** – ~**6.1%**
- **surprise** – ~**3.0%**

So roughly:

- About **a third** of the reviews read as joyful.
- Another **third** are emotionally flat, or at least ambiguous enough to land in `neutral`.
- The remaining **third** is split between various shades of “not happy” — sadness, disgust, anger, fear — with a small extra slice of surprise.

This is already more nuanced than the Steam label:

- Steam tells us that ~80% of reviews are _recommendations_.
- The emotion model tells us that only about a third of those texts are clearly joyful.
- A big chunk of the corpus is written in **negative or mixed moods**, even though the author might still click “thumbs up.”

We haven’t crossed emotions with `sentiment` yet, so we don’t know:

- How many `joy` reviews are actually thumbs down.
- How many `anger` reviews still recommend the game.

But you can already see the shape of the thing. This is a community that spends a lot of time being both invested and slightly upset.

The interesting part is in the disagreement between the two labels. That’s what we’ll look at next.

### When Mood and Recommendation Disagree

Now that every review in our sample has both:

- a **Steam label** (`positive` / `negative`), and
- a **mood** (`joy`, `anger`, `sadness`, etc.)

we can look at how those two interact.

```python
# Crosstab of emotion vs Steam label (positive/negative)
mood_sent_crosstab = pd.crosstab(
    emotion_sample["emotion"],
    emotion_sample["label"],  # 'positive' / 'negative'
    normalize="index",        # proportions per emotion
).sort_index()

mood_sent_crosstab
```

| emotion  | negative | positive |
| -------- | -------- | -------- |
| anger    | 0.374751 | 0.625249 |
| disgust  | 0.558712 | 0.441288 |
| fear     | 0.153548 | 0.846452 |
| joy      | 0.033856 | 0.966144 |
| neutral  | 0.178906 | 0.821094 |
| sadness  | 0.364735 | 0.635265 |
| surprise | 0.174938 | 0.825062 |

The crosstab looks like this (proportions within each emotion):

- **joy** → 3.4% negative, **96.6% positive**
- **neutral** → 17.9% negative, **82.1% positive**
- **surprise** → 17.5% negative, **82.5% positive**
- **fear** → 15.4% negative, **84.6% positive**
- **anger** → 37.5% negative, **62.5% positive**
- **sadness** → 36.5% negative, **63.5% positive**
- **disgust** → **55.9% negative**, 44.1% positive

A few things are very on-brand for Dead by Daylight:

- `joy` is almost entirely positive. When the model thinks someone is joyful, they nearly always recommend the game.
- `neutral`, `surprise`, and even `fear` are mostly positive. For a horror game, “fear but still thumbs up” makes a lot of sense.
- `anger` and `sadness` are **not** mostly negative. Roughly two-thirds of angry or sad reviews still recommend the game.
- `disgust` is the only mood where **negative** wins: more than half of disgusted reviews are thumbs down.

So the emotional space looks more like this:

- A big warm cluster: joyful / neutral / surprised / scared but generally recommending the game.
- A conflicted cluster: angry / sad but still mostly positive.
- A smaller, sharper corner: disgusted and mostly negative.

That “angry but positive” zone is exactly the energy you see all the time in DBD:

> “I have 1,500 hours in this, the matchmaking is awful, perk X is broken, tunneling is worse than ever, I hate it. **Recommended.**”

If we only looked at Steam’s `sentiment`, we’d call that a positive review and move on.  
The mood label forces us to admit that a lot of “positive” reviews are actually written in frustration, disappointment, or exhaustion.

And the opposite also happens: there _are_ joyful negative reviews, but they’re rare. When someone is genuinely happy about the game, they almost always click thumbs up. It’s the negative moods that split: some people bail (negative), some stay (positive but mad).

For actual analysis or teaching, this is useful because you can frame more interesting tasks:

- “Find positive-but-angry reviews and explain what they’re angry about.”
- “Detect when sentiment and mood disagree and monitor that over time.”
- “Compare language in joyful positives vs. angry positives vs. disgusted negatives.”

It’s no longer just “Is this text positive or negative?” but “How complicated is this person’s relationship with the game in this paragraph?”

## What Different Moods Actually Look Like

The raw emotion proportions told us that:

- About a third of reviews read as **joy**,
- About a third as **neutral**,
- And the remaining third is split across **sadness**, **anger**, **disgust**, **fear**, and **surprise**.

We also saw that even obviously negative moods like `anger` and `sadness` still recommend the game most of the time, while `disgust` is the only mood that’s majority thumbs-down.

That’s interesting, but still abstract. To get a better picture, I looked at three things:

1.  The **typical phrases** each mood uses (as bigrams).
2.  How **long** those reviews are.
3.  How many **hours** those players had when they wrote them.

That’s where it starts to feel very Dead by Daylight.

```python
def top_ngrams_for(df_slice, n: int = 2, k: int = 5, text_col: str = "review"):
    return top_ngrams(df_slice[text_col], n=n, top_k=k)

# Joyful reviews
joy_pos = emotion_sample[
    (emotion_sample["emotion"] == "joy")
    & (emotion_sample["label"] == "positive")
]
joy_neg = emotion_sample[
    (emotion_sample["emotion"] == "joy")
    & (emotion_sample["label"] == "negative")
]

joy_pos_bi = top_ngrams_for(joy_pos, n=2, k=5, text_col=text_col)
joy_neg_bi = top_ngrams_for(joy_neg, n=2, k=5, text_col=text_col)

joy_pos_bi, joy_neg_bi
```

I reused the code above for also `anger` and `disgust` and then analyzed that compared with playtime.

```python
emotion_sample["text_len"] = emotion_sample[text_col].astype(str).str.len()

emotion_stats = (
    emotion_sample
    .groupby("emotion")
    .agg(
        mean_len=("text_len", "mean"),
        median_len=("text_len", "median"),
        mean_playtime_min=("author_playtime_at_review_min", "mean"),
        median_playtime_min=("author_playtime_at_review_min", "median"),
        share_positive=("label", lambda s: (s == "positive").mean()),
        count=("emotion", "size"),
    )
    .sort_index()
)

emotion_stats
```

Here are the full results but let’s look at some in details.

| emotion  | mean\_len  | median\_len | mean\_playtime\_min | median\_playtime\_min | share\_positive | count |
| -------- | ---------- | ----------- | ------------------- | --------------------- | --------------- | ----- |
| anger    | 210.928755 | 64.0        | 23646.589627        | 8331.0                | 0.625249        | 7018  |
| disgust  | 314.312474 | 74.0        | 27524.477289        | 10191.0               | 0.441288        | 7111  |
| fear     | 284.043638 | 88.0        | 15582.952080        | 3415.5                | 0.846452        | 4904  |
| joy      | 96.235002  | 38.0        | 12691.102828        | 3009.0                | 0.966144        | 26170 |
| neutral  | 137.392676 | 14.0        | 17632.386500        | 4278.0                | 0.821094        | 25097 |
| sadness  | 164.173441 | 49.0        | 22363.406482        | 7116.0                | 0.635265        | 7282  |
| surprise | 142.574442 | 37.0        | 15626.959057        | 3584.5                | 0.825062        | 2418  |

### Joy: Short, Simple, and Early

For reviews tagged as **joy**, the most common phrases in _positive_ recommendations look exactly like you’d expect:

- `good game`
- `fun game`
- `great game`
- `play friends`
- `game play`

Short, straightforward, and often social. It’s “this is fun with my friends”, not a design doc.

The rare **joyful but negative** reviews are almost funny:

- `potato server`
- `server potato`
- (and still) `fun game`, `game fun`, `play game`

So even when the model hears joy in the text and the reviewer clicks thumbs down, they’re often complaining about servers in a half-joking way, not writing a bitter breakup letter.

Structurally, joyful reviews look light:

- **mean length** ~96 characters, median ~38
- **mean playtime** ~12,691 minutes (~212 hours)
- **median playtime** ~3,009 minutes (~50 hours)
- **share positive**: 96.6%

So joy is:

- **Short**
- **Early-ish** (median ~50 hours)
- **Almost always recommending the game**

It’s the honeymoon phase, written in one or two lines.

### Anger: Long, Invested, and Specific

Angry reviews are where things get more interesting.

For **anger + positive** reviews, the top phrases include:

- `hate game`
- `play game`
- `love hate`
- `hate hate`
- `help meplease`

This is the classic DBD energy:

> “I hate this game, I love this game, send help.”

The model hears anger, Steam sees a thumbs up, and the text is just oscillating between “I can’t stop playing” and “please fix everything.”

For **anger + negative**, the language narrows in on specific things:

- `blight nurse`
- `nurse spirit`
- `spirit blight`
- plus `play game`, `hate game`

So when anger flips over into a thumbs down, it often points at **specific killers** (Blight, Nurse, Spirit) and the design decisions around them. It’s not “this sucks” in the abstract; it’s “_this_ is broken and I am done.”

Structurally, anger is heavier than joy:

- **mean length** ~211 characters, median ~64
- **mean playtime** ~23,647 minutes (~394 hours)
- **median playtime** ~8,331 minutes (~139 hours)
- **share positive**: 62.5%

So angry reviews are:

- **Longer**
- **Written by higher-hour players**
- Still **mostly** recommending the game, but much closer to a coin flip.

If joy is a quick “good game”, anger is the late-night paragraph from someone who’s seen several metas come and go.

### Disgust: the Long, Late Rants

Disgust is where things start to break.

For **disgust + positive** reviews, the model’s top phrases are:

- `worst game`
- `game sucks`
- `dead daylight`
- `good game`
- `play game`

Which is… very on brand. You get lines like “worst game, game sucks, good game”, all inside a recommendation. The mood is disgusted, the relationship is still ongoing.

For **disgust + negative**, the tone shifts a bit:

- `play game`
- `dead daylight`
- `game just`
- `buy game`
- `playing game`

Here it leans more into **value and regret**: having bought the game, having played it, and now being tired of how it feels.

Structurally, disgust is the heaviest of all moods:

- **mean length** ~314 characters, median ~74
- **mean playtime** ~27,524 minutes (~459 hours)
- **median playtime** ~10,191 minutes (~170 hours)
- **share positive**: 44.1% (the only mood that’s majority negative)

So disgusted reviews are:

- The **longest** on average.
- Written by some of the **most experienced** players in the dataset.
- The only mood where negative recommendations outnumber positive ones.

If joy is “I just started and this is fun”, disgust is “I’ve played this for hundreds of hours and I’m tired of the same problems”.

### The Quiet Middle: neutral, sadness, fear, surprise

The other moods fill out the middle:

- **Neutral**
  - Medium length (mean ~137), but a tiny median (~14), so lots of very short “ok” reviews plus some long ones.
  - Mean playtime ~17,632 minutes (~294 hours).
  - Still **82.1% positive**.
- **Sadness**
  - Mean length ~164, median ~49.
  - Mean playtime ~22,363 minutes (~373 hours), median ~7,116 (~119 hours).
  - **63.5% positive**.
- **Fear**
  - Mean length ~284, median ~88 — surprisingly long.
  - Mean playtime ~15,583 minutes (~260 hours).
  - **84.6% positive**, which makes sense for a horror game: being scared is kind of the point.
- **Surprise**
  - Medium length (~143 mean, 37 median).
  - Playtime similar to fear.
  - **82.5% positive**.

Taken together:

- Joy and neutral are shorter and more upbeat; they skew earlier in the relationship.
- Anger, sadness, and disgust get **longer** and come from **more invested players**.
- Disgust sits at the extreme: longest, most hours, most likely to give up the recommendation.
- Fear is long but still very positive — this is people describing tense matches that they enjoyed.

### Why This Matters for the Dataset

All of this is still just counting and grouping, but it changes how the dataset feels:

- You don’t just have “positive vs. negative” reviews.
- You have **joyful short blurbs from new players**, **long disgusted paragraphs from veterans**, **angry recommenders**, and **fearful-but-happy horror fans**.
- You can slice by mood, by experience, by patch, or by any combination.

For someone learning NLP, that opens up more interesting questions than “build a sentiment classifier”:

- “Find angry-positive vs. angry-negative reviews and compare what they complain about.”
- “Look at disgust over time around specific patches.”
- “See how text length and playtime correlate with mood and recommendation.”

And for people who just care about Dead by Daylight, it’s a way to put numbers on something they already feel: the longer you stay, the more complicated your relationship with the game gets — and the more likely you are to write a small essay about it.

## A Tiny Killer Study: Blight, Nurse, Spirit

To show how you can zoom in on specific parts of the dataset, I picked three very “discussion-heavy” killers:

- **Blight** – mentioned **111** times in the patch notes
- **Nurse** – **392** patch mentions
- **Spirit** – **199** patch mentions

Those counts aren’t when they were introduced, just how often they show up in balance notes and bug fixes.

```python
killer_cols = {
    "blight": r"\bblight\b",
    "nurse": r"\bnurse\b",
    "spirit": r"\bspirit\b",
}

for name, pattern in killer_cols.items():
    df[f"mentions_{name}"] = df["review"].astype(str).str.contains(
        pattern, case=False, na=False
    )

for name, pattern in killer_cols.items():
    emotion_sample[f"mentions_{name}"] = (
        emotion_sample[text_col]
        .astype(str)
        .str.contains(pattern, case=False, na=False)
    )

emotion_sample[
    ["emotion", "label", "mentions_blight", "mentions_nurse", "mentions_spirit"]
].head()

def killer_summary(killer: str):
    mask = emotion_sample[f"mentions_{killer}"]
    subset = emotion_sample[mask]
    return {
        "killer": killer,
        "n_reviews": len(subset),
        "share_of_sample": len(subset) / len(emotion_sample),
        "share_positive": (subset["label"] == "positive").mean(),
        "mood_dist": subset["emotion"].value_counts(normalize=True),
    }

for k in ["blight", "nurse", "spirit"]:
    print(killer_summary(k))
```

In the review sample we ran through the emotion model, they show up like this:

- **Blight**: 186 reviews (~0.23% of the sample)
- **Nurse**: 390 reviews (~0.49%)
- **Spirit**: 232 reviews (~0.29%)

So they’re not everywhere, but when they appear, they come with a very specific mood.

### Are Reviews that Mention Them More Negative?

Globally, about **80%** of reviews in the dataset are positive (Steam “recommend”).

For these three:

- **Blight** – **52.2%** positive
- **Nurse** – **54.1%** positive
- **Spirit** – **69.4%** positive

So:

- Reviews that mention **Blight** or **Nurse** are almost a coin flip: barely above half are recommendations.
- Spirit is a bit less radioactive but still far below the global 80% baseline.

Already, that answers one simple question:

> “Are these killers associated with more negative reviews than usual?”  
> **Yes. Very much so.**

### What Moods Do People Write In When They Mention Them?

For the whole emotion sample, the mood distribution was roughly:

- **joy** – 32.7%
- **neutral** – 31.4%
- **sadness** – 9.1%
- **disgust** – 8.9%
- **anger** – 8.8%
- **fear** – 6.1%
- **surprise** – 3.0%

Now just look at reviews that mention each killer.

For **Blight**:

- **neutral** – 31.7%
- **disgust** – 20.4%
- **sadness** – 12.4%
- **joy** – 12.4%
- **anger** – 10.8%
- **fear** – 8.6%
- **surprise** – 3.8%

For **Nurse**:

- **neutral** – 26.9%
- **disgust** – 18.7%
- **anger** – 15.6%
- **sadness** – 13.3%
- **joy** – 11.8%
- **fear** – 8.7%
- **surprise** – 4.9%

For **Spirit**:

- **neutral** – 33.2%
- **joy** – 19.0%
- **disgust** – 17.2%
- **anger** – 10.3%
- **sadness** – 9.9%
- **fear** – 6.5%
- **surprise** – 3.9%

A few things jump out:

- **Joy collapses.**
  - Globally, joy is ~33% of reviews.
  - For Blight and Nurse, joy is only **11–12%**.
  - Even Spirit tops out at ~19%.
- **Disgust and anger almost double.**
  - Disgust goes from ~9% globally to **18–20%** for all three.
  - Anger goes from ~9% globally to **15.6%** for Nurse and ~10–11% for Blight and Spirit.

So a concrete question like:

> “Do Blight, Nurse and Spirit attract more disgust and anger than the average review?”

is answered pretty clearly: **yes**.

Nurse mentions are **overloaded** with disgust and anger compared to the general mood mix. Blight and Spirit also skew heavily toward disgust, with joy almost cut in half.

### Who Is Complaining About Them?

Because `emotion_sample` still carries `author_playtime_at_review_min` and `experience`, you can then ask:

> “Is this mostly new players complaining, or people with hundreds of hours?”

In the notebook, you can do:

- median playtime for reviews mentioning each killer,
- proportion of mentions coming from `new`, `regular`, `veteran`, `master`.

That answers questions like:

- “Is Nurse mostly a problem for high-hours players?”
- “Does Blight show up more in veteran/master reviews than in new ones?”
- “Is Spirit more evenly hated across all experience bands?”

## Drama Arcs: Tracking a Killer’s Mood Over Time

Once you can flag reviews that mention a specific killer, it’s easy to give them their own little sentiment timeline.

For Nurse, I filtered the dataset down to “reviews that contain the word `nurse`” and then grouped them by month, counting:

- how many such reviews there were, and
- what share of them were positive.

```python
def killer_monthly(killer: str):
    mask = df[f"mentions_{killer}"]
    subset = df[mask]
    monthly_k = (
        subset.groupby("year_month")
        .agg(
            review_count=("review", "size"),
            share_positive=("sentiment", "mean"),
        )
        .reset_index()
    )
    monthly_k["killer"] = killer
    return monthly_k

killer_monthly_df = pd.concat(
    [killer_monthly(k) for k in ["blight", "nurse", "spirit"]],
    ignore_index=True,
)

k = "nurse"
km = killer_monthly_df[killer_monthly_df["killer"] == k].sort_values("year_month")

km[["year_month", "review_count", "share_positive"]].head(), km[
    ["year_month", "review_count", "share_positive"]
].tail()
```

That gives a monthly table like this for the Nurse:

| month          | reviews | percentage |
| -------------- | ------- | ---------- |
| July 2019      | 19      | 63%        |
| August 2019    | 11      | 45%        |
| September 2019 | 8       | 63%        |
| October 2019   | 15      | 47%        |
| November 2019  | 23      | 61%        |
| …              | …       | …          |
| July 2025      | 38      | 55%        |
| August 2025    | 33      | 45%        |
| September 2025 | 22      | 36%        |
| October 2025   | 25      | 52%        |
| November 2025  | 3       | 33%        |

Plotting those monthly values gives a line that **wiggles all over the place**: some months shoot above 80–90% positive, others crash into the 30–40% range.

![Pretrained emotion classifier on Dead by Daylight Steam reviews](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/dbd-steam-reviews-nlp-nurse-analysis.jpg?resize=830%2C326&quality=81&ssl=1)

Two things stand out:

- The **global average** for Nurse mentions is around **54% positive** — way below the ~80% baseline for all reviews.
- Around that average, the Nurse line is **volatile**. She has eras where people are relatively happy, followed by sharp dips where the majority of reviews that mention her turn negative.

Blight and Spirit can be analyzed the same way:

- Filter to `mentions_blight`/`mentions_spirit`.
- Group by month.
- Plot the share of positive reviews that mention them.

You end up with three small, spiky graphs:

- Blight, Nurse, and Spirit each have their own **“drama arc”** over 2019–2025.
- Peaks and troughs roughly line up with balance eras players still talk about.
- You can even put **patch markers** on top if you want to see how their curves react to specific updates.

This isn’t formal balance analysis, but it’s a good example of what the dataset enables: pick any killer, perk, map, or mechanic you care about; track how often players mention it, how positive they are when they do, and how that changes over time.

In the notebook, this is just a few extra boolean columns (`mentions_blight`, `mentions_nurse`, `mentions_spirit`) and a groupby. In terms of questions you can ask, it opens the door to a whole little ecosystem of “micro-studies” on the parts of Dead by Daylight people argue about the most.

## Let’s Wrap It Up

In short, this dataset shows a community that mostly recommends Dead by Daylight while being increasingly conflicted the longer they play. New players (under 100 hours) are overwhelmingly positive; by the time someone hits thousands of hours, reviews are barely above a coin flip. Monthly sentiment stays generally high, but dips cluster around certain balance periods rather than the big chapter drops. When we add a mood label on top of Steam’s thumbs-up/down, the picture gets sharper: a third of reviews are clearly joyful, another third are neutral, and the rest are split between sadness, anger, fear, and disgust. Joy is almost always positive. Anger and sadness are mostly positive too—people rant but still recommend. Only disgust flips: it’s the mood of long, high-playtime reviews where people finally stop giving the game the benefit of the doubt.

Zooming in on Blight, Nurse, and Spirit shows how you can turn all this into focused mini-studies. Reviews that mention any of the three are far less positive than the global 80% baseline, and their mood mix tilts heavily toward anger and disgust. Those same killers are all over the patch notes, which suggests a long-running tug of war between balance changes and player frustration. Together, these pieces show what this dataset is good for: connecting sentiment, mood, playtime, and patch history to answer very human questions about a live-service game—who’s happy, who’s exhausted, and what they’re mad about.

![Dead by Daylight reviews infographic](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/dbd-reviews-infographic.jpg?resize=1536%2C2752&quality=81&ssl=1 "Dead by Daylight reviews anatomy infographic")

## What’s Next?

From here, there’s a lot you can do next. You can reuse the same notebook for Steam reviews sentiment analysis on other games or swap in a different model if you want to experiment. You could model sentiment or mood directly, build “angry but still positive” detectors, or study what makes a review “helpful” or “funny.” You could compare free vs. paid players or trace how language around a specific killer or perk changes before and after major patches. Or you could ignore models entirely and just use the notebook as an interactive microscope on the game’s history, killer by killer, patch by patch.

You’re limited only by your imagination and curiosity.

I hope you enjoyed reading this case study as much as I enjoyed writing it. Download the dataset below or [on Kaggle](https://www.kaggle.com/datasets/nicolamustone/steam-reviews-english-dead-by-daylight) and practice with NLP as you see fit!
