# 生成プロンプト

生成方式：ChatGPTの組み込み画像生成。既存3キャラクターを参照したポーズ差分。
生成後の処理：依頼書で許可された背景除去、アルファ境界の調整、余白のトリミング、縦横比を保った縮小。人物の描き足しは画像生成で実施。

## 共通指定

Use case: identity-preserve. Asset type: a single finished 2D game character pose-variant sprite for Christmas Sabotage. The input is the original character sprite and is the exact identity, clothing, proportions, art style, camera, and lighting reference. Change ONLY pose and the required handheld object. Match the polished semi-realistic Japanese anime game illustration, refined dark outlines, warm subtle rim light and neutral body shading of the reference. Preserve the exact adults' facial features, hair, ages, every garment, footwear, colors, and accessories. Camera: elevated three-quarter approximately 45-degree overhead view, matching the reference. Composition: one isolated full-body sprite (the couple is one paired sprite), tightly framed with the complete body and all fingertips/feet visible; maximum use of canvas, absolutely no clipped limbs or coat hem. The lowest shoe/coat edge should nearly touch the bottom, with almost no transparent floor margin. Preserve natural human proportions. Output true transparent-background PNG with clean antialiased alpha, not a checkerboard painting, no opaque background. NO ground plane, NO cast shadow or contact shadow, NO text, numerals, logo, watermark, icons, strong glow, or bloom. 

## npc_couple_photo.png

参照素材：`npc_couple.png`

The two original adults stand close side by side. The man extends one arm forward holding ONE smartphone for a selfie, screen facing them and rear of phone visible to viewer. Both look toward the smartphone; the woman leans slightly toward him and smiles. The phone and extended arm must be clearly legible at small sprite size. Both entire bodies and all shoes are visible.

## npc_couple_toast.png

参照素材：`npc_couple.png`

The two original adults turn toward each other, each holding ONE clear stemmed wine glass at chest height, lightly raising the glasses toward each other just BEFORE a toast. Two glasses total, with small amounts of wine. They smile subtly at one another. Show both complete bodies and every shoe. No table, no phone, no furniture.

## npc_couple_tunnel.png

参照素材：`npc_couple.png`

The two original adults HOLD HANDS and lean slightly forward as they start taking ONE step together toward the upper-right depth of the scene. With his free hand the man points clearly in their direction of travel, as if toward the entrance of a light tunnel beyond the frame. The woman's free hand is relaxed. Show a readable forward stepping silhouette, both full bodies, all shoes, and all fingertips; three-quarter view with enough of their faces still visible to recognize them. No tunnel or environment is included.

## npc_couple_star.png

参照素材：`npc_couple.png`

The two original adults stand nestled close together, both raising their faces and eyes UPWARD. The woman clearly points ONE index finger up toward an imaginary Christmas tree star high above them, while the man follows her gesture with his gaze. Include the entire raised pointing arm and all fingertips as well as both full bodies and all shoes. No actual tree, star, background, or icons.

## npc_guard_check.png

参照素材：`npc_guard.png`

The EXACT same middle-aged security guard in the reference uniform leans slightly forward while WALKING to inspect something, a suspicious puzzled expression. He holds his existing black flashlight in one hand and aims it diagonally forward, with the other arm naturally balancing his stride. Show the entire guard from peaked cap through both black shoes, with a clear stepping pose. Do NOT draw any light beam, glow, floor, question mark, or extra prop.

## player_agent_work.png

参照素材：`player_agent.png`

The EXACT same stern adult male agent kneels on ONE knee, the other foot planted, crouched down doing delicate work. His black-gloved hands reach toward an imaginary control panel in front of him toward upper-right; the control panel itself is NOT part of this character sprite. His face remains impassive and recognizable in three-quarter view. His long black coat hem spreads naturally around his kneeling legs. Include the full crouching body, both feet/shoes, hands/fingertips, and entire coat hem. Do not crop the lower body. No wires, tools, control panel, floor, or extra objects.

