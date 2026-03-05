fn main() {
    // whisper-rs handles downloading and compiling whisper.cpp automatically.
    // On macOS ARM64, enable Metal acceleration for GPU-accelerated inference.
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        println!("cargo:rustc-env=WHISPER_METAL=1");
        println!("cargo:rustc-link-lib=framework=Metal");
        println!("cargo:rustc-link-lib=framework=MetalKit");
        println!("cargo:rustc-link-lib=framework=Accelerate");
    }
}
