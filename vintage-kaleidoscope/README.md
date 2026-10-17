# 光の小箱 — Vintage Kaleidoscope
WebGPU / WGSL によるクラシック万華鏡の試作。

公開: https://2rwa.github.io/hello-world-pages/vintage-kaleidoscope/

三枚鏡の三角領域への鏡映折り返し、二枚鏡の扇形鏡映。回転する3D SDFガラス片（八面体・薄い直方体）をフラグメントWGSL内でsphere-tracingし、法線と半透明の疑似シェーディングで表現。ドラッグ回転、ガラス片再配置、色彩・数・倍率・速度・光量、停止/全画面。

厳密な鏡内光線反射・ガラス屈折を解く物理シミュレータではなく、鏡映対称＋3D SDFレイマーチによるリアルタイム表現。

CIはSwiftShader WebGPUでWGSLコンパイル、パイプライン生成、オフスクリーン描画、GPU完了待機、readbackの非一様画素と色確認を行う。通常表示とCIは同一WGSL / pipelineを利用。