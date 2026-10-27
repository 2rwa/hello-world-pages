# Dynamic Wave Trains / WebGPU Ocean

**公開テスト**: https://2rwa.github.io/hello-world-pages/dynamic-wave-trains/

[Dynamic Wave Trains: A Procedural Approach to Spatially Varying Ocean Synthesis (2026)](https://doi.org/10.1111/cgf.70495) に着想を得た、独立した WebGPU + WGSL の海面描画実験です。

## 内容

- 6 本までの狭帯域波列を直接加算し、FFT は利用しません。
- 各波列に独立した波長・波高・進行方向・分散速度 `omega = sqrt(g * k)` を与えます。
- 複素フェーザの合成で確率的位相場を簡略近似し、第二高調波の転送関数で尖った波頭を表現します。
- 低周波の方向変形、移流、局所ガストによって位置ごとに波の進行方向・振幅を変化させます。
- 遠方の細波を波列別にローパスして、地平線付近のエイリアシングを抑えます。
- 水面は **高さ場** `f(t) = ray.y(t) - height(ray.xz(t))` です。距離場ではないためSDF sphere tracingを使わず、符号変化区間を走査し二分法で交点を求めます。
- 有限差分法線、Schlick Fresnel、空の疑似環境反射、太陽ハイライト、法線傾斜と波列位相に連動する白波を描きます。
- モバイル用の内部レンダリング解像度調整、指/マウスドラッグ、ピンチ/スクロールに対応しています。

## 原論文との相違

**論文そのものの実装・再現ではありません。** 論文の複素 Gaussian exemplar の tiling-and-blending、トロコイド profile lookup、解析的 MIPmap / slope covariance と LEAN-BRDF、海底依存の屈折・障害物の反射回折は、現時点では未実装です。

この試作では狭帯域の2成分複素フェーザによる近似を使っています。確率過程の厳密性はなく、有限の成分数による長距離の繰り返しも残ります。白波は位相・勾配から導く経験的マスクで、流体の砕波計算ではありません。

## 実行

静的ファイルだけで動きます。GitHub Pages の HTTPS またはローカル HTTP サーバから `index.html` を開いてください。WebGPU 対応ブラウザが必要です。

## テスト

`.github/workflows/dynamic-wave-trains-webgpu.yml` は Chrome + SwiftShader を使い、`?ci=1` の offscreen 描画パスで WGSL コンパイル、パイプライン生成、実 draw/submit、readback、ピクセル差、UI スライダー変更を確認します。通常描画と CI は同じシェーダー・レンダリングパイプラインを使用します。
