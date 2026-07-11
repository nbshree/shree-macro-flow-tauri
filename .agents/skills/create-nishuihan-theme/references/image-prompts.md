# Profession Theme Image Prompts

Use these templates after extracting the profession's palette, costume, weapon, material, lighting,
and mood from the supplied reference. Replace every angle-bracket placeholder; do not copy placeholder
colors from another profession.

## Background

```text
Use case: stylized-concept
Asset type: Windows desktop application theme background, final target 1920×1280 landscape
Input images: Image 1 is a style, costume, weapon, material, and mood reference only; do not crop or copy the poster composition
Primary request: create a premium Chinese wuxia environment background for the profession theme “<职业名>”, with no character
Scene/backdrop: <environment and profession motif>; concentrate <weapon/environment accents> on the far right
Style/medium: polished cinematic Chinese martial-arts concept art, painterly realism, refined and restrained
Composition/framing: wide landscape; keep the left 32% and central 34%–78% pale, low-frequency, quiet negative space for application panels; place the visual focus in the rightmost 25%–30%; outer 10% may crop safely
Lighting/mood: <light direction and emotional tone>
Color palette: <background neutrals>, restrained <primary>, small touches of <accent>
Materials/textures: <profession materials>
Constraints: no people, faces, readable text, Chinese calligraphy, profession title, logo, watermark, UI, buttons, tables, text-bearing flags, gore, or large saturated color fields
```

Reject a background if it contains a character, a hard poster split, high-contrast detail under the
left or central panels, or text-like marks.

## Character chroma-key source

```text
Use case: stylized-concept
Asset type: isolated game character layer for a Windows desktop application theme, final transparent canvas target 1200×1280
Input images: Image 1 is a style, costume, weapon, material, and mood reference only; redesign the character and do not copy the poster layout, text, logo, or exact face
Primary request: create a refined <gender/presentation> Chinese wuxia <profession/weapon role> for the profession theme “<职业名>”
Subject: three-quarter to near-full-body adult character, <costume>, <armor/jewelry>, <hair>, holding <weapon>; preserve a clear readable silhouette
Style/medium: premium cinematic game character concept art, painterly realism, realistic material detail
Composition/framing: anchor the character in the right half; turn the body and face toward viewer-left or upper-left; keep the weapon close to the character and right edge rather than crossing the left content area; include complete hair, hands, costume hem, feet, and weapon with generous padding; leave at least 15% empty space on the left
Lighting/mood: <matching cool/warm light and profession temperament>
Color palette: <subject colors>; do not use <key color> anywhere on the subject
Scene/backdrop: perfectly flat solid <key color> chroma-key background, uniform with no shadow, gradient, texture, reflection, floor, or horizon
Constraints: crisp separated edges; no cast shadow, contact shadow, reflection, smoke, translucent magic, loose semi-transparent effects, extra weapons, text, calligraphy, profession title, logo, watermark, or UI
```

Use `#00FF00` by default. Use `#FF00FF` when green is materially present in the subject. Do not use
blue for water, ice, blue, or cyan professions.

For wide weapons, ribbons, water, smoke, or translucent effects, simplify the silhouette into opaque,
cleanly removable shapes. The application needs a robust UI layer, not a poster effect that cannot be
keyed cleanly.

## Texture

```text
Use case: stylized-concept
Asset type: subtle full-window material texture, final target 512×512
Primary request: create a restrained low-frequency texture derived from <paper/water/metal/mist material>
Composition: evenly distributed with no focal point, readable symbol, directional streak, border, or large bright patch; it will be stretched and cropped rather than tiled
Color palette: near-neutral colors compatible with <theme background>
Constraints: no text, logo, blood, cracks, obvious objects, hard seams, UI, or watermark
```

The texture may also be synthesized locally when deterministic noise produces a cleaner result.

## Preview composition

Do not call image generation for the final preview. Composite the accepted final background,
character, and corner SVGs at 480×300. Preserve the background's left negative space and the
character's right-side anchor. Do not add a theme name, UI simulation, title, or logo.

## Prompt iteration rule

Change one defect at a time. Examples:

- “Remove the figure from the background; preserve all scenery and lighting.”
- “Move the weapon to the right edge; keep costume, face direction, and materials unchanged.”
- “Flatten the chroma-key background to one exact color; remove floor shadow and reflection.”

After one targeted retry, compare against the original constraints instead of accepting a visually
attractive but structurally unusable result.
