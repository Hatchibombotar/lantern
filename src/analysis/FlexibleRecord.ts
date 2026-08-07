export class FlexibleRecord<K, V> {
    list: FlexibleRecordItem<K, V>[]

    constructor() {
        this.list = []
    }

    addValue(k: K, v: V) {
        this.list.push([k, v])
    }

    getByKey(k: K) {
        return this.list
            .filter(([key]) => key === k)
    }

    find(fun: ((item: FlexibleRecordItem<K, V>) => boolean)) {
        return this.list
            .filter((item) => fun(item))
    }

    *[Symbol.iterator]() {
        for (const [key, value] of this.list) {
            yield { key, value }
        }
    }
}

type FlexibleRecordItem<K, V> = [K, V]

export type FlexibleRecordError = {
    message: string
    path: string
}