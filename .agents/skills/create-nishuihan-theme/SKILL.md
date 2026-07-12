---
name: create-nishuihan-theme
description: Create and integrate a new built-in profession theme for the shree-macro-flow-tauri Windows app from one or more 逆水寒手游职业立绘 or style references. Use when Codex is asked to add, generate, redesign, plan, or validate a profession theme such as 龙吟、潮光或血河, including visual direction, layered WebP/SVG assets, semantic CSS tokens, TypeScript registration, Rust theme sanitization, documentation, tests, and Tauri build verification.
---

# Create Nishuihan Theme

Turn a profession reference artwork into a complete, maintainable theme package for this
repository. Keep profession visuals in the theme layer and preserve all macro behavior.

## Choose the execution scope

- If the user asks only for a plan, inspect the repository and return a concrete theme spec without
  writing files.
- If the user asks to add, create, implement, or generate the theme, complete assets, code,
  registration, tests, and verification.
- Require a profession name and at least one usable reference image. If the profession name is
  missing and cannot be established from the request, ask one concise question before naming files.
- Treat later user corrections to the visible name as authoritative. Use the profession name itself
  for both `name` and `profession`; do not invent suffixes such as `·霜刃`.
- Do not change versions, commit, push, or publish a Release unless the user separately requests it.

## Inspect before editing

Read these files before designing the new theme:

1. `AGENTS.md`
2. `docs/theme-authoring.md` as the current source of truth
3. `src/themes/types.ts`, `src/themes/registry.ts`, and `src/themes/themes.css`
4. The one or two existing profession themes closest to the new visual direction
5. `ThemeProvider`, `ThemeDialog`, and `ThemeBackground` to understand their generic contracts
6. `src-tauri/src/model.rs` around `sanitize_theme_id`
7. Theme registry, dialog, background, workspace-header, and Rust appearance tests

Inspect `git status` first. Preserve all unrelated and pre-existing changes. Do not reset or replace
work already present in the tree.

Load every local reference with `view_image` at original detail before deriving the theme. Do not
infer profession cues from a filename or thumbnail alone.

## Define the theme contract

Before generating images, write down the following working spec:

- Stable lowercase ASCII theme ID, normally the profession's pinyin.
- Visible profession name and a description of at most roughly 40 Chinese characters.
- Three neutral surface colors, primary color with hover/pressed variants, restrained accent color,
  danger color distinct from the primary, success color, text colors, borders, log colors, and
  decoration opacity.
- Environmental motif, material language, lighting, character silhouette, weapon placement, and
  two corner motifs derived from the reference.
- Background safe zones: left control area and center workflow area remain low-frequency and
  low-contrast; visual focus belongs on the right.
- Character faces left or upper-left toward the content and anchors to the lower right. Keep the
  weapon inside the right-side silhouette; do not let it cross the workflow area.
- Chroma-key color. Use `#00FF00` by default, but use `#FF00FF` when green is materially present in
  the costume, weapon, hair, or effects. Do not use a blue key for water, ice, blue, or cyan themes.

Keep the default theme `longyin`. Append the new ID after existing themes unless the user explicitly
chooses a different order. Never add profession-specific branches to React business components.

If the derived ID already exists, never register a duplicate. Update the existing theme when the
user explicitly asks to redesign or improve it. If the user says “add” and it is unclear whether to
replace the existing theme or create a named variant, state the collision and ask one concise
question; for a plan-only request, clearly label the recommended assumption without writing files.

## Generate the layered assets

Announce that raster work will use the available `imagegen` skill, load that skill, and read
`references/image-prompts.md` before prompting. Explicitly identify the supplied artwork as a style,
costume, weapon, material, and mood reference rather than an edit target.

Produce this seven-file package under `src/themes/<theme-id>/assets/`. Runtime `ThemeAssets`
fields remain optional so the default theme and failed resources can degrade safely, but every
complete profession package must include all seven files:

| File                     | Required output                                     |
| ------------------------ | --------------------------------------------------- |
| `background.webp`        | 1920×1280 RGB WebP, no person, text, logo, or UI    |
| `character.webp`         | 1200×1280 RGBA WebP, transparent background         |
| `log-character.webp`     | 384×384 sRGBA WebP, transparent Q-style character   |
| `preview.webp`           | 480×300 RGB WebP composed from final layers         |
| `paper-noise.webp`       | 512×512 RGB WebP with low-contrast material texture |
| `corner-top-right.svg`   | Code-native decorative SVG, no bitmap or text       |
| `corner-bottom-left.svg` | Code-native decorative SVG, no bitmap or text       |

Follow this sequence:

1. Generate the environment without a character. Keep the left ~32% and central ~34%–78% quiet.
2. Generate a newly composed character on the selected perfectly flat chroma-key background. Avoid
   that key color anywhere on the subject.
3. Copy the generated source to a temporary workspace and run the imagegen skill's installed
   `remove_chroma_key.py` with `--auto-key border --soft-matte --transparent-threshold 12
--opaque-threshold 220 --despill`.
4. Inspect hair, cloth, weapon, hands, and armor on light, dark, and primary-color backgrounds. If a
   thin green fringe remains, retry only once with `--edge-contract 1`.
5. If that retry is still unacceptable, stop and explain the limitation. Do not silently switch to
   a native-transparency CLI or any workflow requiring `OPENAI_API_KEY`.
6. Create a separate Q-style log character composition rather than cropping `character.webp`.
   Preserve the square canvas and soft glow, remove the chroma key with the same workflow, then
   export a 384×384 sRGBA WebP with real transparency and all four corners fully transparent. Keep
   it at or below 250,000 bytes and review the silhouette at the 112–140 CSS pixel display width.
7. Create the subtle texture. Remember that the application stretches it with `object-fit: cover`;
   it is not a tiled CSS texture.
8. Draw the corner assets directly as restrained SVG paths and basic shapes. Do not use raster
   generation for these vector decorations.
9. Compose the preview offline from the final background, character, and corners. Do not bake UI,
   the profession name, calligraphy, a logo, or a `vertical-mark` into any asset.
10. Remove green-screen sources, rejected candidates, review composites, and other temporary files.

Use `view_image` to review final raster assets. Do not accept a file merely because its dimensions
and byte size pass. Keep the complete seven-file package, including `log-character.webp`, within
2,000,000 bytes.

## Implement the theme package

Create `src/themes/<theme-id>/theme.ts` and `theme.css` following the current closest theme.

- Resolve every asset with `new URL('./assets/...', import.meta.url).href`.
- Register `log-character.webp` through the optional `ThemeAssets.logCharacter` field. The default
  theme may omit it; a profession theme may not.
- Define all semantic surface, text, border, primary, state, flow, log, shadow, and decoration
  tokens required by `docs/theme-authoring.md`.
- Keep ordinary controls readable independently of the artwork. Verify normal text contrast at
  4.5:1 or better and strong control boundaries at 3:1 or better.
- Use theme CSS only for tokens, layer positioning, blend mode, opacity, and the generic card fallback
  gradient. Do not change panel dimensions, flow columns, title bar, or business behavior.
- At 1080–1179 CSS pixels, lower or reposition the character only when necessary. Do not introduce
  global horizontal scrolling.
- Preserve clean mode: all full-window artwork and the independent transparent log-character slot
  disappear while the palette and high-opacity functional surfaces remain usable. The character and
  log panel are siblings; the character slot has no surface, border, shadow, or radius. A missing or
  failed log character must collapse its slot so the log returns to full width.

Complete the registration as one transaction:

1. Append the ID to `THEME_IDS` in `src/themes/types.ts`.
2. Import and register the definition in `src/themes/registry.ts`.
3. Import the theme CSS from `src/themes/themes.css`.
4. Add the trimmed ID to Rust `sanitize_theme_id`; keep unknown and blank values falling back to
   `longyin`.
5. Update `docs/theme-authoring.md` with the theme table entry and any genuinely reusable guidance.
6. Keep `ThemeDialog` rendered through generic `themes.map()`. The current four-column grid may wrap
   naturally when a fifth theme is added; do not force every theme into one row. Update hard-coded
   theme counts and wording in tests/docs. Change generic grid CSS only for a verified shared
   overflow or accessibility defect, never for one profession.

Do not modify `App.tsx`, `ThemeProvider`, `ThemeBackground`, or business panels unless a verified
generic defect requires it.

## Add focused tests

Follow existing test style and extend coverage for the new ID:

- Registry order, metadata, normalization, and all seven asset URLs; the default theme may omit
  `logCharacter`.
- Theme dialog visible name, non-duplicated profession label, keyboard selection, preview/apply,
  cancel/Esc rollback, and preview failure fallback where the shared test is table-driven.
- Workspace header label `主题：<职业名>`.
- Theme background's explicit five full-window artwork layers, single-layer failure, theme switching,
  and clean mode when the existing suite expects per-theme coverage. Do not count `logCharacter` as
  a `ThemeBackground` layer.
- Generic log-character rendering for active theme and live preview, preview rollback, clean mode,
  missing/error collapse, recovery after theme switching, and decorative image semantics.
- Rust loading and patching of a whitespace-padded ID, plus unchanged fallback for blank/unknown IDs.

Avoid tests that duplicate Radix internals or replace unrelated theme regression coverage without
reason.

## Validate and deliver

Run the bundled asset validator first:

```text
python .agents/skills/create-nishuihan-theme/scripts/validate_theme_assets.py <theme-id>
```

If the system `python` command is only a Windows Store alias, use a real interpreter such as the
one returned by `uv python find`.

Then run:

```text
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm tauri:build
git diff --check
```

Also inspect 1080×700, 1280×820, and maximized layouts when an interactive Tauri window is
available. Check 100%, 125%, and 150% DPI where possible.

Report:

- The final preview and saved asset paths.
- The final image prompts or concise production prompt set, and whether built-in image generation
  plus local chroma keying was used.
- Asset dimensions, channels, per-file sizes, total theme size, and edge-review result.
- Code and documentation files changed.
- Validation commands and any remaining manual-only checks.
