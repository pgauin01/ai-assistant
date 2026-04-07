use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;

#[napi]
pub struct AudioCapturer {
    // Hold the stream in memory so it doesn't immediately drop and stop recording
    stream: Option<cpal::Stream>,
}

#[napi]
impl AudioCapturer {
    #[napi(constructor)]
    pub fn new() -> Self {
        AudioCapturer { stream: None }
    }

    #[napi]
    pub fn start_capture(
        &mut self,
        #[napi(ts_arg_type = "(err: null | Error, data: Buffer) => void")] callback: JsFunction,
    ) -> Result<u32> {
        // 1. Create a threadsafe function to call JS from the audio thread
        let tsfn: ThreadsafeFunction<Vec<u8>, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| {
                // --- THE FIX ---
                // Create the buffer and convert it to a generic JsUnknown type
                let buffer = ctx.env.create_buffer_with_data(ctx.value)?.into_unknown();
                
                // Create null and convert it to a generic JsUnknown type
                let null = ctx.env.get_null()?.into_unknown();
                
                // Now both are JsUnknown, so Rust is happy to put them in the same array!
                Ok(vec![null, buffer])
                // ---------------
            })?;

        // 2. Initialize OS Audio Host (WASAPI on Windows)
        let host = cpal::default_host();
        
        // Grab the default output device (Speakers)
        let device = host
            .default_output_device()
            .ok_or_else(|| Error::from_reason("No default output device found."))?;

        let config = device.default_output_config().unwrap();
        let sample_rate = config.sample_rate().0;

        // 3. Build the Input Stream (Loopback)
        let stream = device
            .build_input_stream(
                &config.into(),
                move |data: &[f32], _: &_| {
                    // Convert f32 PCM floats to raw u8 bytes
                    let byte_data: Vec<u8> = data.iter().flat_map(|&f| f.to_le_bytes().to_vec()).collect();
                    
                    // Fire the Buffer back to Node.js
                    tsfn.call(byte_data, ThreadsafeFunctionCallMode::NonBlocking);
                },
                |err| eprintln!("Audio stream error: {}", err),
                None,
            )
            .map_err(|e| Error::from_reason(e.to_string()))?;

        stream.play().map_err(|e| Error::from_reason(e.to_string()))?;

        self.stream = Some(stream);
        
        // Return the sample rate so JS knows how to configure the STT engine
        Ok(sample_rate)
    }

    #[napi]
    pub fn stop_capture(&mut self) -> Result<()> {
        self.stream = None; // Dropping the stream stops the OS capture
        Ok(())
    }
}