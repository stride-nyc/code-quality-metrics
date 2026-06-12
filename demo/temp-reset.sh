DEMO_BRANCH="${1:-demo}"
DEMO_SHA="267fa1d19840b5a7215d6aac59dacb42df223bea"

git stash
git branch -f "$DEMO_BRANCH" "$DEMO_SHA"
git switch "$DEMO_BRANCH"
if [[ -d "${PDCA_SKILL_DIR}" ]]; then
  echo "y" | "${PDCA_SKILL_DIR}/install-skill.sh" personal
else
  echo "Warning: PDCA_SKILL_DIR not found (${PDCA_SKILL_DIR}), skipping skill install."
fi
