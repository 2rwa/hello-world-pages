// 第6章: Compute Shaderの結果を表示する。CIも同じパイプラインを使い出力先だけ変更する。
@group(0) @binding(0) var rayTexture: texture_2d<f32>;

@vertex
fn fullscreenVertex(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
  var clipPosition = vec2f(-1.0, -1.0);
  if (vertexIndex == 1u) {
    clipPosition = vec2f(3.0, -1.0);
  } else if (vertexIndex == 2u) {
    clipPosition = vec2f(-1.0, 3.0);
  }
  return vec4f(clipPosition, 0.0, 1.0);
}

@fragment
fn fullscreenFragment(@builtin(position) fragmentPosition: vec4f) -> @location(0) vec4f {
  // positionのピクセル座標は左上原点。Computeも同じ方向で書く。
  return textureLoad(rayTexture, vec2i(fragmentPosition.xy), 0);
}
