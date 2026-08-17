class Skin {
    constructor(image, proportions, offset) {
        this.image = new Image()
        this.image.src = image
        if (proportions !== undefined) {
            this.proportions = proportions
        } else {
            this.proportions = new Vector2(1, 1)
        }

        if (offset !== undefined) {
            this.offset = offset
        } else {
            this.offset = new Vector2(0, 0)
        }
    }
}