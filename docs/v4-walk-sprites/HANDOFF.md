# GitHub反映の残作業

制作・実装・検証は完了。ローカルブランチは `feat/v4-directional-walk-sprites`。
GitHub接続の書込権限不足でブランチ作成APIが403 (`Resource not accessible by integration`) となり、リモートブランチ・PRは未作成。通常のgit pushも認証情報がなく未成功。mainや公開サイトへの変更はない。

納品ZIPにはゲーム一式、バイナリ画像を含む差分パッチ、作業コミットを保存したgit bundle、PR本文案を収録。

## ゲームの確認

ZIPを展開し、そのフォルダーで `python -m http.server 8000` を実行。ブラウザで `http://localhost:8000/game/` を開く。

## 既存リポジトリへ作業ブランチを取り込む

変更のないローカル作業ツリーで実施。bundleのパスはZIPの展開先へ置き換える。

```bash
git fetch origin main
git bundle verify /path/to/v4-walk-sprites.bundle
git fetch /path/to/v4-walk-sprites.bundle refs/heads/feat/v4-directional-walk-sprites:refs/heads/feat/v4-directional-walk-sprites
git switch feat/v4-directional-walk-sprites
git push -u origin feat/v4-directional-walk-sprites
gh pr create --base main --head feat/v4-directional-walk-sprites --title 'v4: 警備員・カップルの方向別歩行スプライトを追加' --body-file docs/v4-walk-sprites/PR_BODY.md
```

基準mainは `c8caa8039892f9cafe9d7d4f360f175ca1a9ee14`。mainが進んでいる場合は、差分を確認して通常のマージ／リベースで取り込む。mainへの強制pushは不要。

bundleを使わず変更だけ取り込む場合は、新規作業ブランチ上で `git apply --check /path/to/changes.patch` を実行し、問題がなければ `git apply /path/to/changes.patch`。bundleとパッチを両方適用しない。
