# Curved FFT Ocean — WebGPU / spherical raymarch

Demo: https://2rwa.github.io/hello-world-pages/webgpu-curved-fft-ocean/

WebGPU computeで5帯域の真正な逆FFTを行い、湾曲した平均海面に波高を重ねてレイマーチングで可視化する独立実験。

- FFT実装は既存の webgpu-fft-ocean-v3/fft.wgsl.js を再利用。JONSWAP系スペクトル、複素時間発展、行列2方向のFFT、5段タイル（2003 / 433 / 97 / 23.3 / 5.3 m）。
- 基準海面は中心(0,-R,0)、半径Rの球面で、原点では水平面y=0に接する。
- 交点判定: F(p)=length(p-center)-R-H_fft(p.xz)。正確なSDFではないので、膨張球面の交差から安全係数付きstepと符号変化検出、7回の二分探索で交点を詰める。
- 波の法線、フレネル反射、空、太陽ハイライト、白波と曲率デバッグ格子。
- UI: 曲率半径・風速・波高・太陽・高度・俯角・白波・GPU FFT品質。

## Limits
周期FFTは球面のx/zチャートで計算されるため小半径では波長が歪む。全球地球物理海洋ではない。白波・空・反射は近似。掠める極細波をレイマーチが見落とす場合がある。スマホは128²品質を推奨。

CI: SwiftShaderで実FFT compute × 5、raymarch WGSL、オフスクリーン描画、GPU readback、異なる曲率半径の画素差を確認。
