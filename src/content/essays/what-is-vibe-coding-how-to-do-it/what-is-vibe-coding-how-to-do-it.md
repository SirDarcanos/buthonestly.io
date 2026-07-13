---
title: What is Vibe Coding and How to Do It
date: 2025-11-04T02:00:51
updated: 2025-11-28T08:42:13
draft: false
excerpt: Vibe coding turns natural language prompts into working code, shifting
  programming from memorizing syntax to communicating intent.
categories:
  - Programming
tags:
  - AI
  - Automation
  - Creativity
  - Productivity
coverAlt: Vibe Coding Programming Language
originalCover: https://buthonestly.io/wp-content/uploads/2025/11/vibe-coding-programming-language.jpg
---

What’s the hottest programming language of this year?

> [!summary]- Quick Summary
>
> - Vibe coding treats your natural language as the “hottest programming language,” with AI translating intent into working code.
> - It differs from normal AI-assisted coding by trust level: you don’t review the code, you only care if it works.
> - It’s safest for low-stakes, small, isolated projects without sensitive data, external services, or meaningful financial risk.
> - Tools like Telex, Replit, Cursor, Lovable, ChatGPT, and Claude already let you build features and apps mostly by prompt.
> - Vibe coding lowers barriers for beginners and speeds experimentation for developers, shifting focus from syntax to architecture and ideas.
> - “VibeOps” roles are emerging where engineers orchestrate AI-generated code, proving that prompting and intent are becoming core dev skills.
> - Traditional programming won’t vanish, but collaborating with AI on code will reshape how we build, ship, and think about software.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

According to [Andrej Karpathy](https://en.wikipedia.org/wiki/Andrej_Karpathy), it’s your language! Andrej is the person who coined **vibe coding** as a term in his now world-famous post on X, where he introduced the concept of AI-assisted coding taken to its extreme.

> There's a new kind of coding I call "vibe coding", where you fully give in to the vibes, embrace exponentials, and forget that the code even exists. It's possible because the LLMs (e.g. Cursor Composer w Sonnet) are getting too good. Also I just talk to Composer with SuperWhisper…
>
> — Andrej Karpathy (@karpathy) [February 2, 2025](https://twitter.com/karpathy/status/1886192184808149383?ref_src=twsrc%5Etfw)

It’s not that it didn’t exist before, but he gave it a name, and with that, a whole new meaning.

So what exactly is vibe coding? And why do I think you should try it (at least once)? Let’s explore that together.

## What Is Vibe Coding? A Simple Definition

When I say that the hottest programming language is _your language_, let’s say English for simplicity, I don’t mean that you literally write software in English. Computers can’t read human language. They can’t even read PHP, Python, or any other high-level language directly.

Traditionally, we write in a programming language that’s later translated into machine code (binary), the only thing computers actually understand. These languages are human-readable _to some extent_, but only for those who’ve invested the time to learn their syntax and logic.

That exclusivity is what vibe coding breaks down.

With vibe coding, you’re not typing code line by line. You’re describing what you want in plain language and letting an AI system (like ChatGPT, Claude, or Cursor) generate the actual code for you. The AI translates your intent into executable code, which is then interpreted by the computer as usual.

In other words, the vibe coding definition is when you are expressing what you want and letting the AI figure out the technical details.

## How to Vibe Code

Let’s see an example of traditional PHP and vibe coding in PHP:

| PHP                    | Vibe Coding PHP                                       |
| ---------------------- | ----------------------------------------------------- |
| `echo "Hello World!";` | `Write the traditional "Hello World!" script in PHP.` |

To write the “Hello World!” script in traditional PHP, you’d need to have read at least one article about PHP to learn the very basic syntax of the language and the `echo` function. To write the same script with vibe coding, you simply need to know that you want it in PHP.

This effectively opens the door to programming for anyone who can express themselves clearly, not just those who know a specific syntax. I actually saw the early signs of this shift back in 2023, when I explored how AI tools were already transforming WordPress workflows. Vibe coding feels like the natural next step in that evolution — moving from using AI as an assistant to treating it as a true coding partner.

## Vibe Coding vs. Agentic Coding

It’s important to make a distinction here. Not all agentic coding is _vibe coding_.

In typical AI-assisted workflows, developers use AI tools to **speed up their process**, asking for snippets, documentation help, or code explanations. They still review and understand what’s being produced. They remain in control. Especially when it comes to existing projects where [context for coding is important](https://mariozechner.at/posts/2025-06-02-prompts-are-code/).

Vibe coding, as Karpathy and others describe it, goes further.

It’s about **trusting the AI completely**, writing a natural-language prompt, generating the code, and judging success purely by whether it works. As Simon Willison put it in [one of his blog posts](https://simonwillison.net/2025/Mar/19/vibe-coding/), if you _check, tweak, and test_ what the AI gives you, that’s AI-assisted coding. If you _don’t even look at the code_, that’s vibe coding.

And he’s right. The difference isn’t about tools, it’s about _trust_.

![hands in front of white and black background](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/10/pexels-photo-3541916.jpeg?resize=975%2C1300&quality=81&ssl=1 "Photo by Matheus Viana on Pexels.com")

If you’re coding responsibly with ChatGPT, reviewing the output for safety, readability, and security, you’re not vibe coding. But if you just want the end result, a working feature, a simple app, or a snippet that “just works”, and you’re fine not knowing what’s under the hood, you’re officially vibe coding.

## When Is Vibe Coding Bad?

Vibe coding is fun and empowering, but it’s also risky. Large language models are powerful, but they’re not infallible. They can generate code that’s inefficient, insecure, or simply wrong.

The answer to when is vibe coding bad or good is relative, but here is my list after having researched the topic and after learning and witnessing what code AI can generate:

- **Low stakes.** The project doesn’t risk harming anyone or any business in any way.
- **Small/New codebases.** The LLM doesn’t need too much context and often can start from scratch. My colleague Veselin has [first-hand experience](https://veselin.blog/2025/06/19/vibe-coding/) on this particular aspect.
- **Low security concern.** It’s offline, local, or used only internally. No user data or sensitive information involved.
- **No external interaction.** The code doesn’t connect to third-party APIs or paid services that could incur costs or unintended actions.
- **Low money involvement.** Even if something goes wrong, you’re not losing money or exposing financial systems.

If your project fits these criteria, I say go ahead, vibe code away. Otherwise, you’re better off checking the output before running it.

## How to Start Vibe Coding

You might be already doing it without realizing.

There are plenty of tools worth exploring to get started with vibe coding:

- Replit. Browser-based IDE where you give natural-language prompts and it builds apps/websites.
- Cursor. AI-powered code editor/IDE geared toward developers.
- Lovable. Platform focused on “anyone can build apps/websites by chatting with AI.”
- ChatGPT or Claude – General-purpose LLMs that can generate, explain, and modify code in virtually any language.

Each of these lets you experiment with coding by prompt, and depending on your level of oversight, they can be used for either AI-assisted or pure vibe coding.

Replit even released a [course on DeepLearning.AI](https://www.deeplearning.ai/short-courses/vibe-coding-101-with-replit/) on vibe coding.

## Why Is Vibe Coding the Future

Vibe coding might sound like a gimmick, but it’s actually a sign of where software development is heading. We’re moving from syntax-based programming to intent-based creation, from “how” to “what.”

For beginners, it lowers the barrier to entry. For experienced developers, it speeds up experimentation and lets you focus on architecture and ideas rather than syntax.

Will vibe coding replace programmers? I believe not, not anytime soon at least. Will vibe coding transform how we write software? Certainly, it is already changing how we write it, how we think about code, creativity, and collaboration between humans and machines.

And that’s something worth vibing with.

### The Rise of VibeOps

Vibe coding isn’t staying a niche experiment for long. It’s already becoming a legitimate role in tech teams. We can call it **VibeOps**.

Several major companies, including Visa, Reddit, and DoorDash, [have begun hiring engineers](https://www.businessinsider.com/vibe-coding-tech-firms-hire-engineers-2025-6) whose day-to-day work revolves around AI-assisted development. These teams don’t just _use_ AI, they operate through it, orchestrating development workflows that blend human judgment with AI-generated output.

In essence, VibeOps is emerging as a discipline that focuses on managing, validating, and optimizing code creation through AI systems; a definition inspired by Business Insider’s coverage of this growing field.

Instead of writing every line of code, VibeOps engineers prompt, guide, and supervise large language models like GPT, Claude, or Cursor to build features faster and more efficiently. Their job is to keep the “vibe” consistent, aligning intent, structure, and quality between human creativity and machine execution.

And while the term might sound playful, the positions are very real. Business Insider notes that startups and even established firms are seeking **“vibe coders”** or **AI-powered engineers** to handle rapid prototyping, automation, and tool integration, often expecting that _half or more_ of their code will be generated by AI.

This marks a shift in what it means to be a developer. The core skill is no longer memorizing syntax. It’s **communicating intent to machines** effectively.

This does not mean that if you have a subscription to an AI tool and no programming skills at all you will get the job. But certainly the programming expertise needed is lower than it has ever been. If you’re already using AI to build apps, automate tasks, or write snippets, you’re halfway there. You’re practicing the fundamentals of VibeOps, even if you didn’t know it yet.

## From Syntax to Sense

Vibe coding isn’t about laziness. It’s about trusting AI as a creative partner and learning to communicate intent clearly. Used responsibly, it’s an incredible accelerator. Used blindly, it’s a recipe for trouble.

Are you just getting started with vibe coding? What do you think about it? Do you trust an AI enough to write production code for you?

Share your experience in the comments below!
