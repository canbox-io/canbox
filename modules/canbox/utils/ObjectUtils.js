module.exports = {
    clone(obj) {
        if(obj == null) return null;
        if (typeof obj !== 'object') {
            return obj;
        } else {
            let newObj = obj.constructor === Array ? [] : {};
            for (let i in obj) {
                newObj[i] = typeof obj[i] === 'object' ? this.clone(obj[i]) : obj[i];
            }
            return newObj;
        }
    },
    equal(obj1, obj2) {
        let keys1 = Object.keys(obj1);
        let keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length) {
            return false;
        }
        for (let i = 0; i < keys1.length; i++) {
            const val1 = obj1[keys1[i]];
            const val2 = obj2[keys2[i]];
            const areObjects = isObject(val1) && isObject(val2);
            if (areObjects && !this.equal(val1, val2)
                || !areObjects && val1 !== val2) {
                return false;
            }
        }
        return true;
    }
}

const isObject = (obj) => {
    return obj != null && typeof obj === 'object';
}