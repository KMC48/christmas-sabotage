# クリスマス粉砕大作戦　iOSアプリ化

2026-10-15　作業ブランチ：`ios/project`（`feat/android-app` 890e44c から作成）

## 1. やったこと

| 項目 | 内容 |
|---|---|
| `@capacitor/ios` の追加 | `8.5.3`（`@capacitor/core` と同じ版。`--save-exact`） |
| iOSプロジェクトの生成 | `ios/`（Swift Package Manager。CocoaPods は使わない） |
| プラグイン | `@capacitor/haptics@8.0.2` が iOS 側にも入った（`ios/App/CapApp-SPM/Package.swift`） |
| アイコン | `game/assets/icon_1024.png`（1024×1024・RGB・透過なし）を `AppIcon.appiconset/AppIcon-512@2x.png` にそのままコピー。角丸なし |
| 起動画面 | `Splash.imageset` の3ファイルを、ゲームの背景色 `#0A0E1C` の無地 2732×2732 に置き換え。`LaunchScreen.storyboard` の背景色も `#0A0E1C` に（白い画面が出ないように） |
| Info.plist | `ITSAppUsesNonExemptEncryption = false` を追加。対応する向きを Portrait のみに（iPhone・iPad の両方のキー） |
| Xcodeの設定 | `MARKETING_VERSION = 1.0.0`、`CURRENT_PROJECT_VERSION = 1`、`TARGETED_DEVICE_FAMILY = 1`（iPhoneのみ）。表示名は `capacitor.config.json` の「クリスマス粉砕大作戦」が `CFBundleDisplayName` に入っている |
| Bundle ID | `com.kmc48.christmassabotage`（**仮**。Androidと同じ値。生成時の値のまま） |
| 最低iOS | 15.0（Capacitor 8 の既定） |
| `package.json` | scripts に `sync:ios`、`open:ios` を追加 |

`game/` と `android/` は変更していません。

## 2. 実行したコマンド

```bash
npm ci
npm install --save-exact @capacitor/ios@8.5.3
node scripts/build-www.mjs          # www/: 48 files, 17.9 MB
npx cap add ios
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

環境：macOS 26.5.2、Xcode 26.5（17F42）、Node v26.8.1、npm 11.19.0、Simulator iOS 26.5

## 3. 結果

### Simulatorビルド

`** BUILD SUCCEEDED **`（署名なし）。できた `App.app` の Info.plist を確認：向き Portrait のみ、`UIDeviceFamily = [1]`、`ITSAppUsesNonExemptEncryption = false`、Version 1.0.0 / Build 1、表示名「クリスマス粉砕大作戦」。

### Simulatorでの画面確認（iPhone 17、iOS 26.5）

| 確認項目 | 結果 |
|---|---|
| 起動画面 | `#0A0E1C` の無地。白い画面は出なかった |
| タイトル画面 | 表示された（[スクリーンショット](screenshots/iphone17-01-title.jpg)）。ただし起動からタイトルが出るまで**約6秒、暗い画面のまま**だった（WebKitのログで firstMeaningfulPaint 6.4秒）。Google Fonts の読み込み待ちの可能性が高い（下記「残り」） |
| 「任務開始」→ STAGE 1 | 開始できた（[スクリーンショット](screenshots/iphone17-02-stage1.jpg)） |
| スティックで移動 | 主人公が動いた |
| 工作 | イルミが冷白色に変わり、聖夜ムードが下がった・コンボが付いた（[スクリーンショット](screenshots/iphone17-03-sabotage.jpg)） |
| HUD と Dynamic Island／ステータスバー | 重ならない（ゲーム画面は 9:16 で、上下に暗い余白が入る） |
| スティック・工作ボタンとホームバー | 重ならない |
| 一時停止画面、「任務を中止する」→ タイトル | 表示・動作した |
| 音 | 最初のタップの後に WebKit の Media Playback が開始したことをログで確認。**実際に音が鳴るかは聞いていない（未確認）** |
| クリア画面・失敗画面 | **未確認**（撮影できなかった） |
| 回転しても縦のまま | Info.plist で Portrait のみを確認。**Simulatorを回して確かめてはいない** |
| Safari Web インスペクタのコンソールエラー | **未確認** |
| iPhone 17e（小さめの画面） | **未確認**（Simulatorの初回起動が終わらなかった） |
| iPhone SE 系 | iOS 26.5 の Simulator に該当機種がないため未確認 |

**iPhone実機での確認は未実施です。**

## 4. 残り・既知の問題

- **起動直後の約6秒の暗い画面**：`game/index.html` が Google Fonts を読み込んでいるためと考えられる。通信がない場合の時間は未確認。フォントの同梱（07指示書の G1）で解消する見込み。今回の決定事項により同梱はしていない。
- **Bundle ID は仮**：App Store Connect に登録すると変えられない。確定したら Xcode の `PRODUCT_BUNDLE_IDENTIFIER`（Debug・Release の両方）と `capacitor.config.json` の `appId` を変える。Android 側（`android/app/build.gradle`）とそろえるかは別途決める。
  - iOS の Bundle ID は英数字・ハイフン・ドットが使える。Android のアプリIDはハイフンが使えない（英数字・アンダースコア）。両方でそろえるなら区切りなし（例：`christmassabotage`）にする。
- 実機での確認（音、マナーモード、振動、記録の保存、中断と復帰、機内モード）は 07指示書の第4章に沿って行う。

## 5. この後の操作（Xcode）

```bash
npm run sync:ios    # game/ を直したら毎回
npm run open:ios    # Xcode で開く
```

1. **Team を選ぶ**：左の App（青いアイコン）→ TARGETS の App → Signing & Capabilities → 「Automatically manage signing」をON → Team を選ぶ。
2. **iPhone実機で起動**：iPhoneをUSBでつなぐ → iPhoneの「設定 → プライバシーとセキュリティ → デベロッパモード」をON → Xcodeの実行先でそのiPhoneを選んで ▶。
3. **Archive**（Apple Developer Program 加入後）：App Store Connect でアプリを作る（Bundle ID は確定値で）→ 実行先を「Any iOS Device (arm64)」→ Product → Archive。
4. **TestFlight**：Organizer → Distribute App → App Store Connect → Upload。提出のたびに Build 番号を +1 する。
