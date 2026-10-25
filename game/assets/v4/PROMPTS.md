# v4 歩行スプライト制作記録

2026-10-10 / built-in imagegen。既存の npc_guard / npc_guard_check / npc_couple / npc_couple_tunnel を参照。
生成後はImageMagickで透明余白を除き、縦横比を維持して人物高508pxに縮小し、指定キャンバスの下端・左右中央へ配置。透過alphaは維持。
左右移動は右向き画像とゲーム側の反転を使用。PNGは静止した歩行ポーズであり、連番アニメーションではない。

## npc_guard_walk_side.png

Use case: identity-preserve. Asset type: ONE production 2D game walking sprite, npc_guard_walk_side.png.
Input images: two reference sprites of the SAME security guard, identity/clothing/painting style references, NOT a collage to reproduce.
Primary request: create this same man a near-side profile walking toward screen RIGHT (his nose and shoe toes point RIGHT), one leg stepping forward. Lower the handheld flashlight toward the ground, no beam.
Preserve exactly the reference identity, body proportions, clothing details, colors, painterly semi-realistic Japanese game illustration with fine dark ink outlines and warm amber rim light, and elevated approximately 45 degree looking-down camera perspective.
The middle-aged clean-shaven Japanese security guard wears the same dark navy peaked cap with small gold button/badge, navy buttoned uniform jacket with breast pockets and epaulettes, pale shirt, navy tie, black belt with brass buckle, navy trousers, black leather shoes. Same stern face, not chibi.
Canvas: 512x512 pixels square. Full body including cap/hair and shoes, no cropping. Center the subject horizontally, fit character height nearly full canvas, soles at bottom edge. Natural stride, not running.
Background: genuine alpha transparency, no floor, no background, no cast shadow or contact shadow. No lighting glow/bloom, flashlight beam, decorative elements, text, letters, numbers, logos or watermarks. Exactly ONE person and ONE direction in the output, not a sheet.

修正指示: Change ONLY angle to a true right-facing SIDE PROFILE walking strictly HORIZONTALLY RIGHT, nose and shoes point directly at RIGHT edge, only ONE eye visible, chest faces RIGHT not viewer. Keep elevated looking DOWN 45-degree camera, same man, same hat and full navy uniform, same flashlight down at side, same warm rim light, exact painted outline style. Natural stride with one foot forward. Full body from cap to soles, transparent 512x512 canvas, no shadow/floor/text.


## npc_guard_walk_front.png

Use case: identity-preserve. Asset type: ONE production 2D game walking sprite, npc_guard_walk_front.png.
Input images: two reference sprites of the SAME security guard, identity/clothing/painting style references, NOT a collage to reproduce.
Primary request: create this same man walking toward the viewer, screen DOWN, frontal face and torso, one foot stepping toward the viewer. Hold the flashlight lowered, no beam.
Preserve exactly the reference identity, body proportions, clothing details, colors, painterly semi-realistic Japanese game illustration with fine dark ink outlines and warm amber rim light, and elevated approximately 45 degree looking-down camera perspective.
The middle-aged clean-shaven Japanese security guard wears the same dark navy peaked cap with small gold button/badge, navy buttoned uniform jacket with breast pockets and epaulettes, pale shirt, navy tie, black belt with brass buckle, navy trousers, black leather shoes. Same stern face, not chibi.
Canvas: 512x512 pixels square. Full body including cap/hair and shoes, no cropping. Center the subject horizontally, fit character height nearly full canvas, soles at bottom edge. Natural stride, not running.
Background: genuine alpha transparency, no floor, no background, no cast shadow or contact shadow. No lighting glow/bloom, flashlight beam, decorative elements, text, letters, numbers, logos or watermarks. Exactly ONE person and ONE direction in the output, not a sheet.


## npc_guard_walk_back.png

Use case: identity-preserve. Asset type: ONE production 2D game walking sprite, npc_guard_walk_back.png.
Input images: two reference sprites of the SAME security guard, identity/clothing/painting style references, NOT a collage to reproduce.
Primary request: create this same man walking AWAY from viewer toward screen UP, clearly show back of cap, back of uniform jacket and back of head, no face visible. Hold flashlight lowered, no beam.
Preserve exactly the reference identity, body proportions, clothing details, colors, painterly semi-realistic Japanese game illustration with fine dark ink outlines and warm amber rim light, and elevated approximately 45 degree looking-down camera perspective.
The middle-aged clean-shaven Japanese security guard wears the same dark navy peaked cap with small gold button/badge, navy buttoned uniform jacket with breast pockets and epaulettes, pale shirt, navy tie, black belt with brass buckle, navy trousers, black leather shoes. Same stern face, not chibi.
Canvas: 512x512 pixels square. Full body including cap/hair and shoes, no cropping. Center the subject horizontally, fit character height nearly full canvas, soles at bottom edge. Natural stride, not running.
Background: genuine alpha transparency, no floor, no background, no cast shadow or contact shadow. No lighting glow/bloom, flashlight beam, decorative elements, text, letters, numbers, logos or watermarks. Exactly ONE person and ONE direction in the output, not a sheet.


## npc_couple_walk_side.png

Use case: identity-preserve. Asset type: ONE production 2D game walking sprite, npc_couple_walk_side.png.
Input images: two reference sprites of the SAME couple, identity/clothing/painting style references, NOT a collage to reproduce.
Primary request: create this same pair both walking together toward screen RIGHT in near-side profile, noses and toes point RIGHT. They are arm in arm or holding hands, both bodies and all four legs readable. Do not point at anything.
Preserve exactly the reference identity, body proportions, clothing details, colors, painterly semi-realistic Japanese game illustration with fine dark ink outlines and warm amber rim light, and elevated approximately 45 degree looking-down camera perspective.
Same black-haired young Japanese man in long camel/beige overcoat, dark brown knit turtleneck, burgundy scarf, dark trousers and brown dress shoes; same slightly shorter brown-haired young Japanese woman with ponytail and burgundy bow, burgundy duffle coat with gold/tan toggles, cream scarf, beige/brown plaid skirt, black tights, brown ankle boots and small brown shoulder bag. Keep the couple consistent with reference: she is at his LEFT side (on screen right in front view). Not chibi.
Canvas: 640x512 pixels landscape. Full body including cap/hair and shoes, no cropping. Center the subject horizontally, fit character height nearly full canvas, soles at bottom edge. Natural stride, not running.
Background: genuine alpha transparency, no floor, no background, no cast shadow or contact shadow. No lighting glow/bloom, flashlight beam, decorative elements, text, letters, numbers, logos or watermarks. Exactly TWO people and ONE direction in the output, not a sheet.

修正指示: Change ONLY direction and pose: rotate BOTH entire characters to a clear RIGHT-FACING SIDE PROFILE walking strictly HORIZONTALLY RIGHT. Both noses point to the RIGHT edge; both chests and both toes point RIGHT. Neither chest faces viewer. See just ONE eye on each face. Both look in walking direction, not at each other. Full body natural walking stride, arm in arm. Keep both people separately readable, woman nearer viewer, man slightly farther. Keep camera elevated looking DOWN 45 degrees; do not make front-facing view. Same identities, coat/scarf/skirt/bag/hair and detailed painted outlines. Transparent 640x512 canvas. No floor/shadow/text. This is the RIGHT walking sprite, not FRONT.


## npc_couple_walk_front.png

Use case: identity-preserve. Asset type: ONE production 2D game walking sprite, npc_couple_walk_front.png.
Input images: two reference sprites of the SAME couple, identity/clothing/painting style references, NOT a collage to reproduce.
Primary request: create this same pair both walking together toward the viewer screen DOWN, front view of both faces and coats, happily arm in arm or holding hands, one foot of each stepping naturally. Do not point at anything.
Preserve exactly the reference identity, body proportions, clothing details, colors, painterly semi-realistic Japanese game illustration with fine dark ink outlines and warm amber rim light, and elevated approximately 45 degree looking-down camera perspective.
Same black-haired young Japanese man in long camel/beige overcoat, dark brown knit turtleneck, burgundy scarf, dark trousers and brown dress shoes; same slightly shorter brown-haired young Japanese woman with ponytail and burgundy bow, burgundy duffle coat with gold/tan toggles, cream scarf, beige/brown plaid skirt, black tights, brown ankle boots and small brown shoulder bag. Keep the couple consistent with reference: she is at his LEFT side (on screen right in front view). Not chibi.
Canvas: 640x512 pixels landscape. Full body including cap/hair and shoes, no cropping. Center the subject horizontally, fit character height nearly full canvas, soles at bottom edge. Natural stride, not running.
Background: genuine alpha transparency, no floor, no background, no cast shadow or contact shadow. No lighting glow/bloom, flashlight beam, decorative elements, text, letters, numbers, logos or watermarks. Exactly TWO people and ONE direction in the output, not a sheet.


## npc_couple_walk_back.png

Use case: identity-preserve. Asset type: ONE production 2D game walking sprite, npc_couple_walk_back.png.
Input images: two reference sprites of the SAME couple, identity/clothing/painting style references, NOT a collage to reproduce.
Primary request: create this same pair both walking AWAY from the viewer screen UP, back view of BOTH heads and coats, no faces visible. They stay close together arm in arm or holding hands. Woman's ponytail and bow and shoulder bag visible from behind.
Preserve exactly the reference identity, body proportions, clothing details, colors, painterly semi-realistic Japanese game illustration with fine dark ink outlines and warm amber rim light, and elevated approximately 45 degree looking-down camera perspective.
Same black-haired young Japanese man in long camel/beige overcoat, dark brown knit turtleneck, burgundy scarf, dark trousers and brown dress shoes; same slightly shorter brown-haired young Japanese woman with ponytail and burgundy bow, burgundy duffle coat with gold/tan toggles, cream scarf, beige/brown plaid skirt, black tights, brown ankle boots and small brown shoulder bag. Keep the couple consistent with reference: she is at his LEFT side (on screen right in front view). Not chibi.
Canvas: 640x512 pixels landscape. Full body including cap/hair and shoes, no cropping. Center the subject horizontally, fit character height nearly full canvas, soles at bottom edge. Natural stride, not running.
Background: genuine alpha transparency, no floor, no background, no cast shadow or contact shadow. No lighting glow/bloom, flashlight beam, decorative elements, text, letters, numbers, logos or watermarks. Exactly TWO people and ONE direction in the output, not a sheet.

修正指示: Keep this back-facing walking pose and all identities/clothing/style/camera exactly, but SWAP the positions of the two people: WOMAN ON SCREEN LEFT, MAN ON SCREEN RIGHT. Woman holds man's LEFT arm so the pair stays consistent when rotating from their front reference. Woman's bag hangs at her outer LEFT side, cream scarf wraps neck and tails go in front of chest (not a new scarf tail down back). Both walk straight AWAY toward screen UP, all faces hidden, full body to soles. Transparent 640x512, no shadow/background/text.

追加修正: Precise clothing continuity correction ONLY. Keep this exact rear walking sprite, exact two people, positions (woman left, man right), stride, perspective, lighting and painted style. Make just TWO corrections: (1) REMOVE the hanging cream scarf tail from the woman's BACK; keep cream scarf wrapped around neck. The two long ends are in FRONT of her chest and so are occluded from this rear view. Her burgundy coat back and ponytail show instead of a scarf down back. (2) MOVE the woman's small brown shoulder handbag and strap from her INNER RIGHT side next to the man to her OUTER LEFT hip on the left silhouette. Strap lies on her outer left shoulder; bag hangs beside her free left arm. This matches her original front sprite with bag on viewer right. No other changes. True transparent alpha background, no shadow, no text, whole bodies visible.


