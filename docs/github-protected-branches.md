# GitHub Protected Branch Policy

`main` and `develop` are shared protected branches. Code should enter either branch only through a pull request that passes the repo Merge Gate.

## Required Policy

Configure branch protection or a ruleset for both `main` and `develop` with these settings:

- Require a pull request before merging.
- Block direct pushes to the branch.
- Require status checks before merging.
- Require branches to be up to date before merging.
- Require the `Validate` status check from the `Merge Gate` GitHub Actions workflow.
- Do not require approving reviews while the project has a single maintainer.
- Do not allow force pushes.
- Do not allow branch deletion.

The required status check is produced by `.github/workflows/merge-gate.yml`. The workflow runs on pull requests targeting `main` or `develop`, and its `Validate` job runs:

```sh
pnpm validate
```

`pnpm validate` runs linting, TypeScript validation, tests, and builds across the workspace.

The policy intentionally does not require approving reviews while one person maintains the project. GitHub does not let a pull request author approve their own pull request, so requiring one approval would block all merges. Revisit this setting once a second maintainer can review pull requests.

## Apply With `gh`

Repository administrators can apply the baseline branch protection policy with:

```sh
scripts/configure-protected-branches.sh
```

The script configures `main` and `develop` through the GitHub REST API using the repository resolved by `gh repo view`. It requires an authenticated `gh` session with repository administration permission.

To preview the repository that will be changed:

```sh
gh repo view --json owner,name --jq '.owner.login + "/" + .name'
```

To inspect the current protection state after applying the policy:

```sh
gh api repos/OWNER/REPO/branches/main/protection
gh api repos/OWNER/REPO/branches/develop/protection
```

Replace `OWNER/REPO` with the repository returned by `gh repo view`.

## Manual GitHub Fallback

If the script cannot be used, configure the same policy in GitHub:

1. Open the repository settings.
2. Go to **Rules > Rulesets** or **Branches > Branch protection rules**.
3. Create a rule for `main`, then repeat it for `develop`.
4. Enable pull request requirements before merge.
5. Leave required approving reviews disabled while the project has a single maintainer.
6. Enable required status checks and select `Validate`.
7. Enable the option that requires the branch to be up to date before merge.
8. Disable force pushes and branch deletion.
9. Save the rule.

After saving, open a test pull request against each protected branch and confirm GitHub blocks merging until `Merge Gate / Validate` passes.
