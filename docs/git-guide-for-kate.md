# Git Guide for Kate

This is a practical guide for working on the Roamer codebase. It covers the day-to-day workflow: creating a branch for your work, saving changes, and sending them to Josh.

**All commands in this guide are typed into Terminal.** To open Terminal: press `Cmd+Space`, type "Terminal", and hit Enter. You'll see a window with a prompt that ends in `%` — that's where you type. Press Enter to run each command.

---

## The mental model

Think of git like this:

- The **repository** is the full history of the project, stored both on your machine and on GitHub.
- **Branches** are parallel versions of the project. You do your work on your own branch so it doesn't interfere with the main version until it's ready.
- **Commits** are snapshots you take of your work. Each commit is a checkpoint you can always return to.
- **Pushing** sends your commits from your machine to GitHub so Josh can see them.

The main branch is called `main`. You generally don't work directly on `main` — you create a branch, do your work there, and then merge it in when it's ready.

---

## Initial setup (one time only)

### 1. Install git

Check if git is already installed:

```zsh
git --version
```

If you see something like `git version 2.x.x`, you're good — skip to the next step.

If you see an error or a dialog pops up asking to install developer tools, click **Install** and let it finish. That installs git automatically.

If neither of those happens, install git via Homebrew. First install Homebrew if you don't have it:

```zsh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install git:

```zsh
brew install git
```

### 2. Set up an SSH key

SSH is how your Mac proves to GitHub that it's you, without needing a password every time. You only do this once.

**Check if you already have a key:**

```zsh
ls ~/.ssh/id_ed25519.pub
```

If you see a file path printed back, you already have a key — skip to "Add your key to GitHub" below.

If you see "No such file or directory", generate one:

```zsh
ssh-keygen -t ed25519 -C "your@email.com"
```

It will ask where to save the file — just press Enter to accept the default. It will also ask for a passphrase — you can set one or leave it blank (press Enter twice). Either is fine.

**Add the key to your Mac's keychain** so you don't have to deal with it again:

```zsh
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
```

**Add your key to GitHub:**

Copy the key to your clipboard:

```zsh
pbcopy < ~/.ssh/id_ed25519.pub
```

Then:

1. Go to [github.com](https://github.com) and sign in
2. Click your profile photo (top right) → **Settings**
3. In the left sidebar, click **SSH and GPG keys**
4. Click **New SSH key**
5. Give it a name (e.g. "My MacBook")
6. Paste into the "Key" field (`Cmd+V`)
7. Click **Add SSH key**

**Test that it works:**

```zsh
ssh -T git@github.com
```

You should see: `Hi [your username]! You've successfully authenticated...`

If you see that, you're set. If you see a "Permission denied" error, double-check that you pasted the key correctly in GitHub.

### 3. Get the project

Once git and SSH are set up, clone the repository (this downloads the project to your machine):

```zsh
git clone git@github.com:wins32767/roadtrip.git ~/work/roadtrip
```

### 4. Go into the project folder

```zsh
cd ~/work/roadtrip
```

### 5. Tell git who you are

Check that git knows who you are:

```zsh
git config user.name
git config user.email
```

If those are blank, set them:

```zsh
git config --global user.name "Kate"
git config --global user.email "your@email.com"
```

---

## Starting work on something new

**Step 1: Make sure you're starting from the latest version of main**

```zsh
git checkout main
git pull
```

`checkout main` switches to the main branch. `pull` downloads any new changes from GitHub.

**Step 2: Create your branch**

Name it something descriptive. Use hyphens, no spaces.

```zsh
git checkout -b kate/photo-sizing
```

You're now on a new branch called `kate/photo-sizing`. Changes you make here won't affect `main`.

---

## Saving your work (committing)

After you've made changes to files, save them to git in two steps.

**Step 1: Stage the files you want to include**

To stage a specific file:

```zsh
git add frontend/index.html
```

To stage everything you've changed:

```zsh
git add .
```

**Step 2: Commit with a message describing what you did**

```zsh
git commit -m "Fix photo sizing so all tiles sit side by side"
```

Keep messages short and specific. Describe *what changed*, not *that you changed it* — "Fix photo sizing" is better than "Updated file."

You can (and should) make multiple commits as you work. Each one is a save point.

---

## Checking what's going on

See what branch you're on and what files have changed:

```zsh
git status
```

See the full list of your commits:

```zsh
git log --oneline
```

---

## Sending your work to GitHub

When you're ready for Josh to see your work:

```zsh
git push origin kate/photo-sizing
```

The first time you push a new branch, git will confirm the branch was created on GitHub. After that, you can just run `git push` from that branch.

---

## Switching between branches

If you need to work on something else, you can switch branches. Make sure you've committed your current work first, or it may get mixed up.

```zsh
git checkout main
```

```zsh
git checkout kate/photo-sizing
```

---

## Staying up to date

If Josh has pushed changes to `main` while you've been working on your branch, you can bring those changes into your branch:

```zsh
git checkout main
git pull
git checkout kate/photo-sizing
git merge main
```

If git tells you there's a conflict, it means the same part of a file was edited in both places. That's rare but can happen — ask Josh to help resolve it the first time.

---

## Quick reference

| What you want to do | Command |
|---|---|
| See current status | `git status` |
| Switch to main | `git checkout main` |
| Get latest changes | `git pull` |
| Create a new branch | `git checkout -b branch-name` |
| Stage all changes | `git add .` |
| Commit staged changes | `git commit -m "your message"` |
| Push to GitHub | `git push origin branch-name` |
| See commit history | `git log --oneline` |

---

## If something goes wrong

- **"nothing to commit"** — you haven't made any changes, or you forgot to `git add` first.
- **"not a git repository"** — you're in the wrong folder. `cd ~/work/roadtrip` and try again.
- **"rejected" when pushing** — someone else pushed changes; run `git pull` first.
- Anything else that looks scary — just stop and ask Josh before doing anything else.
