# LIQUID STRIKE — Metaball Skirmish

斜め上から見下ろす2Dシューティング。敵は画像素材ではなく、WebGL2フラグメントシェーダで2Dスカラー場を合成し、等値面として描画するメタボールです。近づく液滴の輪郭は連結します。

- 公開: https://2rwa.github.io/hello-world-pages/metaball-skirmish/
- 開始: MISSION START / Enter
- 移動: 矢印 / WASD / マウス、タッチドラッグ
- 射撃: 常時オート
- BOMB: Shift / B / 右下ボタン（初期2回）
- 一時停止: P / Esc / 右下ボタン
- 大型敵を撃破すると小さな液滴に分裂
- 4ウェーブごとにボス、敵弾と回復・武装強化アイテムあり
- WebGL2が使えない環境ではCanvas2Dの液滴描画に切り替え
- 依存ライブラリ・ビルド工程・外部アセットなし

構成:
- `game.js` : 当たり判定、敵AI、弾幕、スコアなど
- `metaballs.js` : 2Dメタボールを描くGLSL ES3とフォールバック
- `render.js` : 斜め俯瞰の床、機体、エフェクト
- `main.js` : DOM、タッチ/キーボード、ゲームループ
- `ci-test.mjs` : Puppeteerの実ブラウザテスト

注: あくまで新しい独立したプロトタイプです。