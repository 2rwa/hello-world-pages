# Hybrid WebGPU Shoreline

WebGPU の通常ラスタライズと depth-aware water、限定的な WGSL レイマーチを一つのシーンで比較する実験です。

## Architecture

- **Raster scene**: Three.js `WebGPURenderer` で砂浜地形、岩、杭、水中オブジェクトを通常メッシュとして描画。
- **Depth-aware water**: 水面の `backdropNode` から `viewportSharedTexture()` と `viewportDepthTexture()` を読み、屈折先が前景へ飛び出す場合は元の screen UV に戻す。
- **Water depth / clarity**: 水面 depth と scene depth の差を光学深度として使い、浅瀬では砂やオブジェクトを見せ、深くなるほど青緑へ吸収。
- **Selective raymarch**: 12 fixed steps の WGSL ボリューム積分を浅瀬の光筋だけに使用。地形・岩・一般オブジェクトの交差判定はレイマーチしない。
- **Shore foam**: scene depth gap と波パターンから簡易的な波打ち際を生成。

## Why hybrid

全面レイマーチでは、GLTF や通常メッシュを水越しに正しく扱うために独自の交差系を増やす必要があります。この版では通常3Dシーンを source of truth にし、水に必要な color/depth を再利用します。レイマーチはラスタライズで代替しにくい体積効果だけを担当します。

## Controls

- Water clarity
- Refraction
- Raymarch glow（0 にすると depth refraction だけを比較可能）
- Wave scale
- Slow camera orbit

## Test

GitHub Actions では Chrome + SwiftShader WebGPU を使い、WebGPU backend、3フレーム以上の実描画、GPU queue completion、UI操作の状態反映、スクリーンショット生成を回帰確認します。
