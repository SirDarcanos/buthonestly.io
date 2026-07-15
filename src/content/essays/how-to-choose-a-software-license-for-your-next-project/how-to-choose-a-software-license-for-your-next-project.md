---
title: How to Choose a Software License for Your Next Project
date: 2026-05-05T02:00:00
updated: 2026-05-23T12:21:45
sticky: true
cornerstone: false
excerpt: Push code to GitHub with no license file and it isn’t really open source — just visible. Choosing a license feels like a legal maze, but it’s one of the most important calls you’ll make.
categories:
  - Programming
tags:
  - Productivity
  - Workflow
coverAlt: How to Choose a Software License
originalCover: https://buthonestly.io/wp-content/uploads/2025/11/choose-software-license.jpg
---

> [!summary]- Quick Summary
>
> - Without an explicit license, your code is **“all rights reserved”** and others can’t legally use, modify, or share it.
> - A software license is how you **give people permission** to use your work under specific conditions. Before choosing a license, decide your goals: **maximum adoption**, **guaranteed openness (copyleft)**, or **keeping parts proprietary**.
> - **Permissive licenses** (e.g. MIT, BSD, Apache 2.0) allow broad reuse, including in closed-source/commercial software.
> - **Copyleft licenses** (e.g. GPL) require derivative works to **remain open source** under the same or compatible license.
> - Always include a clear **LICENSE file**, update copyright notices, and mention the license in your **README** and project metadata.
> - Mixing licensed code has rules: you must **check compatibility** between your chosen license and any dependencies.
> - You can change or relicense your project later, but this gets harder once **outside contributors** are involved.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

Choosing a software license can feel like a legal maze, but it’s one of the most important decisions you’ll make for your software.

Developers often treat licenses as an afterthought. You finish building something, push it to GitHub, and move on. But if your repository doesn’t include a license file, you’re not technically “open source.”

By default, _no license_ means **all rights reserved**. Others can’t legally reuse, modify, or distribute your code. Even if someone forks your project or fixes a bug, they’re in a legal gray zone.

Licensing your software early prevents headaches later. It protects your intentions, defines what others can do with your code, and helps your project grow under clear rules.

This guide explains how to choose a software license that fits your goals, whether you’re sharing open-source tools or protecting private projects.

**Disclaimer**

Everything shared in this essay reflects **my own opinions and experience**. I’m speaking solely on my behalf — **not on behalf of Automattic Inc.** or any of its brands.

This essay provides **general educational information** about software licensing based on common practices in the open-source community. **It is not legal advice** and should not be relied upon as such. Software licensing involves complex legal considerations that vary by jurisdiction. Before making licensing decisions that could affect your legal rights or obligations, **consult a qualified attorney** specializing in intellectual property law.

## What a Software License Really Does

A software license is a legal framework that answers three questions:

1.  Who can use your code?
2.  What can they do with it?
3.  Under what conditions?

If you share your code publicly, a license is how you control the answers.

Not all open source is the same. Some licenses encourage maximum freedom, while others enforce openness. That’s where the two broad categories come in: **permissive** and **copyleft**.

![An open book that reads Permissing and Copyleft on the pages](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/two-open-books-labeled-permissive-and-copyleft-minimalist-provides-visual-breathing.png?resize=1024%2C768&quality=80&ssl=1)

**Permissive licenses** (like MIT or Apache 2.0) let others do almost anything as long as they give credit. **Copyleft licenses** (like GPL) generally allow reuse only if derivative works also stay open-source

The choice defines your project’s DNA — whether it spreads freely or ensures that openness stays intact downstream.

## The Most Common Open-Source Licenses

### MIT License

The [MIT license](https://tlo.mit.edu/understand-ip/exploring-mit-open-source-license-comprehensive-guide) is short, simple, and extremely permissive. It lets anyone reuse, modify, and even sell your code, as long as they include your original copyright and license notice.

It’s ideal if your main goal is _adoption_. You’re saying, “Use it however you want, just give me credit.”  
That’s why MIT dominates GitHub, from React to small npm packages. As AI-powered tools like ChatGPT generate more code, understanding these licenses becomes even more critical for developers navigating both human-written and AI-generated contributions.

**Best for:** small libraries, educational projects, or anything meant to spread widely with minimal friction.

### GNU General Public License (GPL)

The [GPL](https://www.gnu.org/licenses/licenses.html) protects _user freedom_ by requiring anyone who redistributes your code, modified or not, to do so under the same license.

This “copyleft” clause keeps your work and its derivatives open-source forever. But it also means you can’t include GPL code in a closed-source product.

WordPress, Linux, and thousands of other projects rely on GPL to guarantee that improvements remain free and accessible.

**Best for:** projects where openness matters more than commercial flexibility.

> _“The GPL isn’t just a license, it’s a promise that freedom stays built into your software.”_

### Apache License 2.0

[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) is permissive like MIT but adds **patent protection**.

If someone contributes code to your project and later tries to sue you over a patent related to that contribution, the Apache license invalidates their claim.

Patent protection matters increasingly as developers embrace AI-assisted development and [[what-is-vibe-coding-how-to-do-it|vibe coding practices]] where code authorship becomes less clear-cut.

**Best for:** large or corporate-backed projects, or if you want explicit legal protection.

### BSD Licenses

[BSD licenses](https://en.wikipedia.org/wiki/BSD_licenses) (2-Clause and 3-Clause) are functionally similar to MIT. The 3-Clause adds a “no endorsement” rule, preventing people from using your name to promote derivative products.

**Best for:** low-level software, libraries, or academic projects.

### Creative Commons (CC) Licenses

[Creative Commons licenses](https://creativecommons.org/share-your-work/cclicenses/) are not for code, they’re for **content**: documentation, tutorials, UI assets, icons, videos, etc.

- **CC-BY:** reuse allowed with attribution.
- **CC-BY-SA:** same as above, but derivatives must use the same license (like GPL).
- **CC-BY-NC-SA:** same as above, but the content cannot be used for commercial purposes.
- **CC0:** public domain dedication — no attribution required.

**Best for:** non-code assets that accompany software.

### License Comparison at a Glance

| License              | Modify | Redistribute | Commercial Use | Require Attribution | Must Share Derivatives | Patent Protection |
| -------------------- | ------ | ------------ | -------------- | ------------------- | ---------------------- | ----------------- |
| **MIT**              | ✅     | ✅           | ✅             | ✅                  | ❌                     | ❌                |
| **GPL**              | ✅     | ✅           | ✅             | ✅                  | ✅                     | ❌                |
| **Apache 2.0**       | ✅     | ✅           | ✅             | ✅                  | ❌                     | ✅                |
| **BSD (2/3-Clause)** | ✅     | ✅           | ✅             | ✅                  | ❌                     | ❌                |
| **CC-BY-SA**         | ✅     | ✅           | ✅             | ✅                  | ✅                     | ❌                |
| **CC-BY-NC-SA**      | ✅     | ✅           | ❌             | ✅                  | ✅                     | ❌                |
| **CC0**              | ✅     | ✅           | ✅             | ❌                  | ❌                     | ❌                |

This table provides general guidance. Always review specific license terms in full.

## What If You Don’t Want to Open Source It?

Not every project should be open-source. Internal tools, client work, or commercial software often need to stay private.

If your goal is to keep full control, you don’t need an open-source license at all. Simply **reserve all rights** with language such as this:

```text
Copyright © [Year] [Your Name or Company]
All rights reserved. This software may not be used, copied, modified, or distributed without explicit permission.
```

If you distribute software (like a paid plugin or SaaS), use a custom [EULA (End User License Agreement)](https://en.wikipedia.org/wiki/End-user_license_agreement).  
It defines what users _can do_ (install, use, modify internally) and _cannot do_ (resell, redistribute, reverse-engineer, etc.).

## How to Choose the Right Software License

Choosing a license isn’t about memorizing legal jargon — it’s about aligning with your goals. The steps to choose a license outlined below are a guideline for you to follow, although you might want to dig deeper based on your specific case.

> _“Licensing decisions shape your project’s future before the first user even downloads it.”_

### Step 1. Clarify your goals.

- Want your code to spread freely? → _MIT, Apache, BSD._
- Want to ensure derivatives stay open? → _GPL._
- Want to keep it private? → _All rights reserved or EULA._
- Sharing creative assets? → _Creative Commons._

### Step 2. Check dependencies and libraries.

If your project uses third-party libraries, their licenses may _force_ your choice.

**Example:**  
If you bundle a GPL library, your project **typically must** also be GPL-compatible  
MIT and Apache mix freely, but non-commercial CC assets can’t appear in paid WordPress themes.

### Step 3. Think about contributors and companies.

If you expect contributions, use a familiar, trusted **open-source license**.  
Companies usually prefer MIT or Apache because they’re clear and risk-free.

### Step 4. Add a LICENSE file early.

Even a placeholder helps. It signals clarity and avoids confusion later.

### Step 5. Take advantage of these resources and tools.

- [choosealicense.com](https://choosealicense.com) — plain-English summaries.
- [GitHub license picker](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
- [SPDX License List](https://spdx.org/licenses/).
- [TLDRLegal](https://tldrlegal.com) — readable license explanations.

### Step 6. Consult a lawyer. (optional)

If you deem it necessary and are unsure which license to choose, **consult a lawyer familiar with intellectual property and open-source licensing**.

## Can You Change Your License Later?

You can, but not retroactively. Once a version is released under a software license, it stays that way.  
Future versions can use a new license, but old ones remain under the original terms.

**Example:** Project is MIT until commit `abc123`, GPL after `def456`. Code before `abc123` stays MIT forever. Everything after is GPL.

If others have contributed, get their consent before relicensing. Large projects solve this with [Contributor License Agreements (CLAs)](https://en.wikipedia.org/wiki/Contributor_license_agreement).

### What If You Used the Wrong License by Mistake?

If you catch it early (and nobody cloned/forked your repo yet), fix it fast:

```bash
git commit --amend
git push --force
```

If the repo was already public, deleting or rewriting history won’t remove the old license. Those copies remain valid.

To correct it:

1.  Commit the right license.
2.  Add a README note explaining the fix.
3.  Restart the project if it had low visibility.
4.  Get legal advice if needed.

Deleting your repository doesn’t delete the license others already received.

## How to Properly Add a License to Your Project

Picking a license is one thing, actually _applying_ it is another. If you don’t include it correctly, the license technically doesn’t exist.

Here’s how to make sure your license is clear, valid, and visible everywhere it needs to be.

### Step 1. Create a `LICENSE` file in your project root

Every public repository or distributed project should include a plain-text file named exactly `LICENSE` or `LICENSE.txt`.

That file should contain the **full text** of your chosen license, not just a reference or link.  
You can copy it directly from [choosealicense.com](https://choosealicense.com), the SPDX database, or the official license source (like the [GNU site](https://www.gnu.org/licenses/)).

**Example (for MIT):**  
Copy the entire MIT license text, update your name and year, and place it at the root of your repo.

```text
MIT License

Copyright (c) 2025 Nicola Mustone

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

This makes it immediately visible to anyone viewing or downloading your project.

### Step 2. Add a short header comment to your source files

While the main license file is the official reference, it’s good practice to include a **short header comment** in your key files, especially if the project might be reused elsewhere.

At the top of major files (like `index.js`, `main.py`, or `plugin.php`), add something like:

```javascript
/*
 * Project: My Cool Library
 * License: MIT
 * Copyright © 2025 Nicola Mustone
 * See LICENSE file in the project root for full license text.
 */
```

This ensures that even if the file gets copied out of context, the license still travels with it. You don’t have to include this in every single file, just the core ones that might be reused individually.

These header comments appear in every snippet I share, from e-commerce customizations like [[disable-gtin-requirements-non-eligible-woocommerce-products|disabling GTIN requirements]] to Python scripts. The headers travel with the code, ensuring proper attribution even when files are copied individually.

### Step 3. Include license info in your package metadata (if applicable)

If your project is published as a package or library, always declare the license in its metadata:

**For npm (JavaScript)**:

```text
{
  "name": "my-project",
  "license": "MIT"
}
```

**For Python (setup.cfg or pyproject.toml)**:

```text
license = "MIT"
```

**For Composer (PHP)**:

```text
{
  "license": "GPL-2.0-or-later"
}
```

These declarations make your license machine-readable and visible in package directories and dependency scanners.

### Step 4. Mention the license in your README

Your README is the first thing people see, and many won’t check the LICENSE file.  
Add a short line at the bottom, like:

```text
License: MIT © 2025 Nicola Mustone
```

If you’re dual-licensing (e.g., open-source and commercial), note that too:

```text
License: GPL-2.0-or-later for open use, or commercial license available upon request.
```

This provides instant clarity without legal digging.

### Step 5. Keep it consistent everywhere

Consistency builds trust. Your license file, headers, and metadata should all say the same thing: version, year, and type included.

If you ever update your license (say from GPLv2 to GPLv3), change it everywhere in one go.

> _“Your license isn’t just a file — it’s a declaration of intent. Make it impossible to miss.”_

## What to Do If Someone Violates Your License

Even with the clearest license, infringements happen. Maybe someone copied your code without attribution, resold your GPL-licensed plugin without sharing the source, or used your assets in a way your license doesn’t allow.

Here’s how to handle it, calmly, methodically, and without burning bridges.

![Software license violation](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/11/software-license-violation.jpg?resize=999%2C562&quality=81&ssl=1 "Photo by The New York Public Library on Unsplash")

### Step 1. Confirm it’s really a violation.

Start by checking the facts. Ask yourself:

- Did they actually breach a license term (like removing attribution or not sharing modifications)?
- Is your license clearly included in your project and easy to find?
- Could it be a misunderstanding rather than intentional misuse?

Many developers simply don’t realize what a license requires. If you’re unsure whether a situation counts as infringement, **consult a lawyer familiar with intellectual property and open-source licensing** before taking action. It’s the best way to protect yourself and avoid unnecessary conflict.

### Step 2. Reach out privately first.

If you’re confident there’s an issue, contact them directly and politely. Include:

- A link to your original project and license file.
- A short explanation of what part of the license they’re violating.
- What action you’d like them to take (for example, restore attribution, publish modified source, or remove unlicensed content).

Keep your message factual and professional. Most people will comply once they understand the situation.

### Step 3. If they ignore you, escalate carefully.

If they don’t respond or refuse to resolve the issue:

- **Consider filing** a DMCA takedown with the platform hosting the content (GitHub, npm, WordPress.org, etc.).
- For GPL projects, organizations like the **Free Software Foundation** or **Software Freedom Conservancy** sometimes assist in enforcing compliance.
- In serious or commercial cases, contact a lawyer to explore next steps.

**Note:** Filing a DMCA takedown requires a good faith belief that infringement occurred, and false claims can have legal consequences.

Document everything — emails, screenshots, repository links — before escalating. It makes any future action more straightforward.

### Step 4. Focus on compliance, not punishment.

The goal isn’t to “win” a dispute, it’s to bring your work back under the terms you set.  
If the other party resolves the issue and respects your license going forward, treat that as success. Education and clarity usually go farther than confrontation.

## Take a Moment to Choose a Software License

Choosing a license isn’t about control — it’s about clarity. [[do-you-trust-your-instincts-making-smart-wordpress-choices|Evaluating WordPress plugins and themes]] requires the same judgment. A good license defines boundaries, protects your work, and shows professionalism.

Whether you want your code to empower others or stay private, decide intentionally — not by omission.

Next time you push a project live, take a moment for the license.  
It’s the smallest file in your repo but often the most powerful one.

> _“The smallest file in your repo might be the one that protects it most.”_

## What About This Essay?

I practice what I preach.

The text and images in this article are licensed under **Creative Commons Attribution–ShareAlike–NonCommercial (CC BY-SA-NC)**. You can share, adapt, or remix it for non-commercial purposes. Just credit me and keep it under the same license.

Any code (or piece of) on this website is licensed under **GNU GPL v2 (or later)**, so you can use and modify it in compatible projects, in the spirit of open source.

Unless otherwise specified, this is the default license for all content published on _buthonestly.io/_.
