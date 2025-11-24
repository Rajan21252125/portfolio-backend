import cloudinary from "./cloudinary.ts";
export const uploadBuffer = (buf, options) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
        if (err)
            return reject(err);
        resolve(result);
    });
    stream.end(buf);
});
