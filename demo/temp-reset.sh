DEMO_BRANCH="${1:-demo}"
DEMO_SHA="267fa1d19840b5a7215d6aac59dacb42df223bea"

git stash
git branch -f "$DEMO_BRANCH" "$DEMO_SHA"
git switch "$DEMO_BRANCH"
echo "y" | "/Users/kenjudy/ObsidianVaults/PDCA Process/claude-skill/install-skill.sh" personal
