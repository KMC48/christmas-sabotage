# クリスマス粉砕大作戦　Androidアプリ化とGoogle Play配信

初回実装：2026-10-11　作業ブランチ：`feat/android-app`

2026-10-15：PR #3へ統合済み。最新の統合検証は [native-integration.md](../native-integration.md) を参照。下記のエミュレータ／ビルド記録は元ブランチでの実施結果です。

## 1. できていること（2026-10-11、Windowsで実施）

| 項目 | 状態 |
|---|---|
| Capacitor 8.5.3 の導入（`package.json`、`capacitor.config.json`） | 済み |
| 配信用ファイルの抽出（`scripts/build-www.mjs`。`game/` から tests・tools・*.md を除いて `www/` へ） | 済み（48ファイル、18.0MB） |
| Androidプロジェクト（`android/`）の生成 | 済み |
| 縦画面固定、起動画面とアイコン背景をゲームの暗色（#0A0E1C）に | 済み |
| ランチャーアイコン（`icon_1024.png` から生成。`scripts/make_android_icons.py`） | 済み |
| 振動：アプリ版はCapacitorのHapticsで鳴らす（Web版は従来どおり `navigator.vibrate`） | 済み（`game/game.js`） |
| リリース署名の仕組み（`android/keystore.properties` があれば使う） | 済み（鍵はまだ無い） |
| デバッグ版APKのビルド | 済み |
| リリース版AABのビルド | 済み（**未署名**。Google Playへは上げられない） |
| 既存の回帰テスト（`run_tests.py`） | 94件 PASS |

アプリの設定値：

- アプリID：`jp.kmccreativelab.christmassabotage`（2026-10-15確定。iOSのBundle IDと同じ。Google Playに一度上げると変えられない）
- 表示名：クリスマス粉砕大作戦
- 対応OS：Android 7.0（API 24）以上、targetSdk 36
- バージョン：versionName 1.0.0 / versionCode 1（iOSの Version 1.0.0 / Build 1 とそろえる）
- 権限：INTERNET（Capacitorの標準）、VIBRATE（振動）

## 2. Windowsでビルドするときの注意

必要なもの：Node（24で確認）、JDK 21、Android SDK（platform 36）。Windowsでの注意点が2つあります。

- **パスに日本語（`クリスマス粉砕`）が入っていると、Androidのビルドが止まります。** 英数字だけのドライブ文字（X:）を割り当てます。
- **OneDriveの中でビルドすると、同期中のファイルがロックされて失敗します。** 環境変数 `XMAS_ANDROID_BUILD_DIR` で、ビルドの出力先をOneDriveの外に移します（`android/build.gradle` に設定済み。未設定なら従来どおり `android/` 配下に出力します）。

```powershell
subst X: "<プロジェクトのフォルダ>"     # PCを再起動したらやり直す
$env:XMAS_ANDROID_BUILD_DIR = "$env:LOCALAPPDATA\xmas-android-build"
cd X:\
npm install                      # 初回のみ
node scripts/build-www.mjs       # game/ → www/
npx cap sync android             # www/ → android/
cd android
.\gradlew.bat assembleDebug      # デバッグ版APK
.\gradlew.bat bundleRelease      # リリース版AAB
```

できたファイルの場所：

- デバッグ版APK：`%LOCALAPPDATA%\xmas-android-build\app\outputs\apk\debug\app-debug.apk`
- リリース版AAB：`%LOCALAPPDATA%\xmas-android-build\app\outputs\bundle\release\app-release.aab`

`game/` を直したら、毎回 `build-www.mjs` と `cap sync` をやり直してください。そうしないとアプリに反映されません。

`node_modules/` はOneDriveの同期対象に入ります。同期が重い場合は、プロジェクトをOneDriveの外へ移すことを検討してください。



## 3. スマホで試す（デバッグ版）

1. Androidの設定で「開発者向けオプション」→「USBデバッグ」をONにし、USBでPCにつなぐ。
2. `adb install -r android\app\build\outputs\apk\debug\app-debug.apk`
   - adbの場所：`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`
   - またはAPKファイルをスマホへ送って開く（「提供元不明のアプリ」を許可する）。
3. 確認すること：全ステージ、特別ステージ、エンディングまで遊べるか。スティックと工作ボタンが押せるか、ナビゲーションバーと重ならないか。振動・音・BGM。アプリを終了して再起動したとき記録が残るか。戻るボタンの動き。通信を切った状態での表示。

## 4. Google Playで配信するまで（あなたがやること）

| # | やること | 補足 |
|---|---|---|
| P1 | Google Play Consoleのデベロッパー登録（登録料は一度だけ） | 本人確認に数日かかることがある |
| P2 | ~~アプリIDを決める~~ | 2026-10-15に `jp.kmccreativelab.christmassabotage` で確定済み |
| P3 | **アップロード鍵を作る**（下記） | 鍵とパスワードを失うと更新を出せなくなる。必ず別の場所にもバックアップする |
| P4 | プライバシーポリシーのURL | 必須。GitHub Pagesに置いてよい |
| P5 | ストアの掲載情報：説明文、アイコン512×512、フィーチャーグラフィック1024×500、スクリーンショット | サイズはPlay Consoleの最新の要件で確認する |
| P6 | コンテンツのレーティング（IARCのアンケート）、データセーフティ、対象年齢、広告の有無 | アプリは通信せず個人情報を集めない前提。回答案はClaude Codeが下書きできる |
| P7 | **テスト**：個人のデベロッパーアカウントは、本番公開の前にクローズドテストが必要 | 必要な人数と期間はPlay Consoleの最新の要件で確認する（2024年時点では12人・14日間） |
| P8 | 審査に出して公開 | |

### アップロード鍵の作り方（P3）

鍵は**リポジトリの外**に置きます。OneDriveのプロジェクトフォルダの中にも置かないでください。パスワードはチャットに貼らないでください。

```powershell
mkdir $env:USERPROFILE\keys
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore $env:USERPROFILE\keys\christmas-sabotage-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

続けて `android\keystore.properties` を作ります。このファイルはGitの対象外です。

```
storeFile=C:/Users/<ユーザー名>/keys/christmas-sabotage-upload.jks
storePassword=（設定したパスワード）
keyAlias=upload
keyPassword=（設定したパスワード）
```

この状態で `.\gradlew.bat bundleRelease` を実行すると、署名済みのAABができます。これをPlay Consoleへアップロードします。Play App Signing（Googleが配信用の鍵を管理する方式）を使ってください。

## 5. iOS版と共通の残り作業

- **フォントの同梱**：2026-10-15に対応済み。`game/fonts/` に、ゲームで使う文字だけを含むフォント（woff2、合計約420KB、OFLライセンス）を置き、Google Fontsは読まない。ゲームの文章を変えたら `python scripts/subset_fonts.py --check` で確認し、足りなければ `python scripts/subset_fonts.py` で作り直す（要 `pip install fonttools brotli`）。
- **画像の権利確認**：AI生成の画像（ChatGPT／Gemini）を使っているため、生成サービスの規約で商用配信ができるか確認してください。
- **残り素材8点**：届く前に出すか、届いてから出すかを決めてください。
- アップデートのたびに、`versionCode` を1つ増やしてください。

## 6. 検証の状況

- 既存の回帰テスト94件はPASSです。ゲームの得点・時間・判定・ステージは変えていません。
- APKの中身を確認済み：アプリID、表示名、権限、対応OS、アイコン。
- **エミュレータ**（Android 15、Pixel 7相当、1080×2400、WebView Chrome 124）で確認した結果：

| 確認項目 | 結果 |
|---|---|
| 起動、タイトル画面 | 表示された |
| ステータスバー・ナビゲーションバー | ゲームの暗色で、文字は白。最初は白いバーだったので修正した |
| 「任務開始」→ STAGE 1 | 開始できた。スティックで主人公が動いた。HUD・スティック・工作ボタンがバーと重ならない |
| Capacitorとの連携 | 有効（platform = android） |
| 振動（Haptics）の呼び出し | 成功（エミュレータなので、実際の振動は体感していない） |
| 記録の保存（localStorage） | 書き込み・読み出しできた |
| 通信なしでの起動 | 起動し、画像も表示された。10/15のフォント同梱後は、ロゴ書体も含めて通信ありと同じ表示（外部への通信なし） |

- **実機（Androidスマホ）での確認は未実施です。** 音、実際の振動、タッチ操作の感触、戻るボタン、全ステージの通しプレイは、実機で確認してください。
- 戻るボタンは、Capacitorの標準どおりアプリを閉じます。ゲーム中は一時停止にしたい場合は、追加の対応が必要です。
