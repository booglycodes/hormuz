const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")
ctx.imageSmoothingEnabled = false

function drawImage(img, x, y, width, height, deg, flip, flop, center, frame_width, frame) {
    ctx.save();
    
    if(typeof width === "undefined") width = img.width;
    if(typeof height === "undefined") height = img.height;
    if(typeof center === "undefined") center = false;
    if(typeof frame_width === "undefined") frame_width = img.width;
    if(typeof frame === "undefined") frame = 0;
    
    // Set rotation point to center of image, instead of top/left
    if(center) {
        x -= width/2;
        y -= height/2;
    }
    
    // Set the origin to the center of the image
    ctx.translate(x + width/2, y + height/2);
    
    // Rotate the canvas around the origin
    var rad = 2 * Math.PI - deg * Math.PI / 180;    
    ctx.rotate(rad);
    
    // Flip/flop the canvas
    if(flip) flipScale = -1; else flipScale = 1;
    if(flop) flopScale = -1; else flopScale = 1;
    ctx.scale(flipScale, flopScale);
    
    // Draw the image    
    ctx.drawImage(
        img, 
        frame_width * frame, 
        0, 
        frame_width, 
        img.height,
        -width/2, 
        -height/2, 
        width, 
        height
    );
    
    ctx.restore();
}

class ImageComponent {
    constructor(image_src, offset_scalars, flipped) {
        this.image_src = image_src
        this.offset_scalars = offset_scalars
        this.flipped = flipped
        this.angle = 0
    }

    draw() {
        let position = this.gameobject.position.add(this.offset_scalars.vector_scale(this.gameobject.physical_properties.dimensions))
        drawImage(
            this.image_src,
            position.x, 
            position.y,
            this.gameobject.physical_properties.dimensions.x,
            this.gameobject.physical_properties.dimensions.y,
            this.angle,
            this.flipped,
            false,
            true
        )
    }
}

class AnimatedImageComponent {
    constructor(image_src, frame_width, frames_between, num_frames, offset_scalars, flipped, hold_end_frame) {
        this.image_src = image_src
        this.frame_width = frame_width
        this.frames_between = frames_between
        this.num_frames = num_frames
        this.offset_scalars = offset_scalars
        this.flipped = flipped
        this.hold_end_frame = hold_end_frame === undefined ? false : hold_end_frame

        this.time = 0
        this.frame = 0
    }

    draw() {
        if (this.time >= this.frames_between) {
            this.time = 0
            if (this.hold_end_frame) {
                this.frame = Math.min(this.frame + 1, this.num_frames - 1)
            } else {
                this.frame = (this.frame + 1) % this.num_frames
            }
        }
        let position = this.gameobject.position.add(this.offset_scalars.vector_scale(this.gameobject.physical_properties.dimensions))
        drawImage(
            this.image_src,
            position.x, 
            position.y,
            this.gameobject.physical_properties.dimensions.x,
            this.gameobject.physical_properties.dimensions.y,
            0,
            this.flipped,
            false,
            true,
            this.frame_width,
            this.frame
        )
        this.time++
    }
}

function drawCircle(x, y, radius, fill, stroke, strokeWidth) {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false)
    if (fill) {
        ctx.fillStyle = fill
        ctx.fill()
    }
    if (stroke) {
        ctx.lineWidth = strokeWidth
        ctx.strokeStyle = stroke
        ctx.stroke()
    }
}

class CircleComponent {
    constructor(offset_scalars, fill_color, stroke_color, stroke_width, scale) {
        this.offset_scalars = offset_scalars
        this.fill_color = fill_color
        this.stroke_color = stroke_color
        this.stroke_width = stroke_width
        this.scale = scale === undefined ? 1 : scale
    }

    draw() {
        let position = this.gameobject.position.add(this.offset_scalars.vector_scale(this.gameobject.physical_properties.dimensions))
        drawCircle(
            position.x,
            position.y,
            this.gameobject.physical_properties.dimensions.x / 2 * this.scale,
            this.fill_color,
            this.stroke_color,
            this.stroke_width
        )
    }
}

function drawRect(x, y, width, height, color) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, width, height)
}

class RectComponent {
    constructor(offset_scalars, color) {
        this.offset_scalars = offset_scalars
        this.color = color
    }

    draw() {
        let position = this.gameobject.position.add(this.offset_scalars.vector_scale(this.gameobject.physical_properties.dimensions))
        drawRect(
            position.x - this.gameobject.physical_properties.dimensions.x / 2,
            position.y - this.gameobject.physical_properties.dimensions.y / 2,
            this.gameobject.physical_properties.dimensions.x,
            this.gameobject.physical_properties.dimensions.y,
            this.color
        )
    }
}

function drawText(text, color, font, x, y, align) {
    ctx.textAlign = align
    ctx.fillStyle = color
    ctx.font = font
    ctx.fillText(text, x, y)
}

class TextComponent {
    constructor(text, color, font) {
        this.text = text
        this.color = color
        this.font = font
    }

    draw() {
        drawText(this.text, this.color, this.font, this.gameobject.position.x, this.gameobject.position.y, 'center')
    }
}