# Auto-Deploy Setup (BRAT)

This plugin uses BRAT (Beta Reviewers Auto-update Tester) for automatic updates during development.

## How It Works

**Every push to `main` or `claude/**` branches:**
1. GitHub Actions builds the plugin
2. Creates a GitHub release with incrementing version: `0.2.0-dev.7`, `0.2.0-dev.8`, etc.
3. BRAT detects the new version via semantic versioning
4. Plugin auto-updates on all devices within ~3 minutes

## Key Insights

### BRAT Uses Semantic Versioning, Not Tag Names

❌ **Wrong approach:** Using a static `latest` tag
- BRAT picks highest semver, not tag names
- Version `0.1.0` released repeatedly = no updates detected

✅ **Correct approach:** Incrementing pre-release versions
- `0.2.0-dev.1`, `0.2.0-dev.2`, `0.2.0-dev.3`, etc.
- Each version is higher than the last
- BRAT sees each as a new update

### Semantic Version Ordering

```
0.1.0-dev.6  <  0.1.0  <  0.2.0-dev.1  <  0.2.0-dev.2  <  0.2.0
```

**Critical:** Dev versions must be **higher** than the last installed version.
- If BRAT installed `0.1.0`, then `0.1.0-dev.X` is a downgrade (won't update)
- Solution: Bump base version to `0.2.0`, use `0.2.0-dev.X`

## GitHub Actions Workflow

Located: `.github/workflows/release-on-push.yml`

**Key steps:**
1. Extract base version from `manifest.json` (e.g., `0.2.0`)
2. Append GitHub run number: `0.2.0-dev.${{ github.run_number }}`
3. Update `manifest.json` with dev version
4. Build plugin with updated version
5. Create GitHub release with `main.js` and `manifest.json`

**Critical flags:**
- `prerelease: true` - Marks as pre-release
- `makeLatest: false` - Doesn't mark as "latest release"
- `tag: ${{ steps.version.outputs.dev_version }}` - Unique tag per build

## BRAT Installation

**First-time setup:**
1. Install BRAT plugin in Obsidian
2. Settings → BRAT → Add Beta Plugin → `nfelger/obsidian-tools`
3. Enable "Bullet Flow" in Community Plugins

**Configure auto-updates:**
- Settings → BRAT → Update Beta Plugins at Startup: **ON**
- Settings → BRAT → Notification of Updates: **ON**
- Update Check Interval: **2 hours** (or shorter during active dev)

**Manual update:** Settings → BRAT → Check for Updates button

## Version Management

**During development:**
- Keep base version in `manifest.json` (e.g., `0.2.0`)
- Each push creates `0.2.0-dev.X` release
- Don't commit dev versions to repo

**For official releases:**
- Bump `manifest.json` to `1.0.0` (or next version)
- Create proper release (not from auto-deploy workflow)
- Publish to Obsidian community plugins

## Troubleshooting

**Updates not detected?**
- Check semver ordering - dev versions must be higher than installed version
- Verify GitHub Actions succeeded (green checkmark)
- Check release has `main.js` and `manifest.json` attached
- BRAT logs: Settings → BRAT → Logs

**Build failing?**
- Check GitHub Actions tab for error logs
- Verify `npm run build` succeeds locally
- Check TypeScript compilation errors

## References

- [BRAT Developer Guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)
- [BRAT Plugin](https://github.com/TfTHacker/obsidian42-brat)
- [Semantic Versioning](https://semver.org/)

---

**Result:** Zero manual file copying. Every commit auto-deploys to all devices. 🚀
