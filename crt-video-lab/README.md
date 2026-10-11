# WebGPU CRT Video Lab

[Live demo](https://2rwa.github.io/hello-world-pages/crt-video-lab/)

WebGPU + WGSL のリアルタイムCRT映像処理。動画ファイルをローカルで選択するか、内蔵テストパターンを再生する。サーバーに動画は送信しない。

## Phases

- Phase 1 — Foundation: ドラッグ＆ドロップ、HTMLVideoElement、WebGPU external texture、再生/一時停止/シーク、品質指定、原画比較、内蔵テストパターン。
- Phase 2 — Optics: 走査線、蛍光体RGBマスク、スロットマスク、曲面歪み、色収差、vignette、2-pass Gaussian bloom。
- Phase 3 — Analog: chroma帯域制限、horizontal sync jitter、ノイズ、干渉、ゴースト、前フレーム履歴による残光。
- Phase 4 — Export and validation: プリセット、パラメータUI、WebM/MP4録画（ブラウザが対応する形式）、PNGキャプチャ、GitHub Actions GPU検証、オフスクリーンreadback。

## Architecture

1. input.wgsl: 動画のexternal textureを取得し、処理済みと原画を2枚のGPUTextureへ描画。
2. blur.wgsl: 水平、垂直の2パスぼかし。
3. screen.wgsl: CRT走査線+マスク+BLOOM+残光履歴、canvasと次フレームの履歴へ同時描画。
4. gpu.js: 3パイプライン、4パス/フレーム。CIではcanvas描画先だけオフスクリーンGPUTextureへ差し替え。
5. ui.js と app.js: スライダー、プリセット、動画ファイル、録画、テストパターン。

初期設定の解像度は入力動画と同じ。GPU負荷が大きい場合は50%へ。低解像度動画を200%で出力すると蛍光体マスクと走査線が見やすい。ブラウザ録画はMediaRecorder対応のコーデックに限定され、音声はWebAudioのMediaElementSource経由。WebGPUと動画コーデックの可用性はブラウザ/OSに依存。

## Tests

GitHub ActionsのUbuntu Chromium/SwiftShaderを使用し、shader compile、pipeline、video upload、draw/submit、WebGPU validation、GPUBuffer readback、非黒画面検出、スライダー操作、原画比較UI反映、描画結果スクリーンショットを実施。

Direct local: ホストのHTTPサーバーでリポジトリルートを公開し、/crt-video-lab/ を開く。CIは ?ci=1 でswapchainを使わないオフスクリーン描画に切り替える。
