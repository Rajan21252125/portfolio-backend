import cloudinary from "./cloudinary.js";


export const uploadBuffer = (buf: Buffer, options: any) =>
new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
    if (err) return reject(err);
    resolve(result);
    });
    stream.end(buf);
});
