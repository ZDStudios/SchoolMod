# Contributing to SchoolMod

First off — thank you for taking the time to contribute! 🎉

SchoolMod is a community-driven project and every contribution, no matter how small, makes a difference. Whether you're fixing a typo, reporting a bug, or building out a whole new integration, you're helping make school tools better for everyone.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Contributing Code](#contributing-code)
- [Development Setup](#development-setup)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Style Guidelines](#style-guidelines)
- [Project Structure](#project-structure)

---

## 📜 Code of Conduct

By participating in this project, you agree to keep things respectful and constructive. We're all here to build something cool together.

- Be kind and inclusive
- Welcome newcomers and help them get started
- Accept constructive feedback gracefully
- Focus on what's best for the community

---

## 🤝 How Can I Contribute?

### 🐛 Reporting Bugs

Found something broken? Please [open an issue](../../issues/new) and include:

- **A clear title** describing the problem
- **Steps to reproduce** the bug
- **Expected vs actual behaviour**
- **Your browser and OS**
- **Screenshots or console errors** if applicable

> Please check [existing issues](../../issues) first to avoid duplicates.

### 💡 Suggesting Features

Have an idea for a new feature or platform integration? [Open a feature request](../../issues/new) and tell us:

- What platform or area it relates to
- What problem it solves
- Any examples or mockups if you have them

### 🧑‍💻 Contributing Code

Ready to write some code? Great! Here's the general flow:

1. Check the [open issues](../../issues) for something to work on, or open one yourself
2. Comment on the issue to let others know you're working on it
3. Fork the repo and create your branch (see below)
4. Write your code and test it
5. Submit a Pull Request

---

## 🛠️ Development Setup

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/SchoolMod.git

# 2. Navigate into the project
cd SchoolMod

# 3. Create a new branch for your work
git checkout -b feature/your-feature-name
# or for a bug fix:
git checkout -b fix/your-bug-name
```

> Full dev environment instructions will be added here as the project grows.

---

## ✅ Pull Request Guidelines

Before submitting a PR, please make sure:

- [ ] Your branch is up to date with `main`
- [ ] Your code follows the [style guidelines](#style-guidelines) below
- [ ] You've tested your changes in a supported browser
- [ ] Your PR has a clear title and description explaining *what* and *why*
- [ ] You've linked any related issues (e.g. `Closes #42`)

**Keep PRs focused.** One feature or fix per PR makes reviews faster and easier. Large, unrelated changes will be asked to be split up.

---

## 🎨 Style Guidelines

- Use clear, descriptive variable and function names
- Comment your code where the logic isn't immediately obvious
- Keep functions small and single-purpose
- Avoid committing commented-out code
- Use consistent indentation (2 spaces preferred)

---

## 📁 Project Structure

```
SchoolMod/
├── src/
│   ├── core/          # Core injection and utility framework
│   └── integrations/  # Per-platform enhancement modules
│       ├── ep/        # Education Perfect
│       ├── mathspace/ # Mathspace
│       ├── blooket/   # Blooket
│       ├── kahoot/    # Kahoot
│       └── seqta/     # Seqta
├── docs/              # Documentation
├── CONTRIBUTING.md    # This file
├── LICENSE            # MIT License
└── README.md          # Project overview
```

> Note: This structure may evolve as the project develops.

---

## 🙏 Thank You

Every contribution helps. Even starring the repo or sharing it with a friend makes SchoolMod reach more people. We appreciate you! ⭐
