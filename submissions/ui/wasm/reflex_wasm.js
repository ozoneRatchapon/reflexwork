/* @ts-self-types="./reflex_wasm.d.ts" */

/**
 * The programme catalogue, indexed once, so each question only pays for matching (port of `resolveProgramme`).
 */
export class Resolver {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ResolverFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_resolver_free(ptr, 0);
    }
    /**
     * `programmes`: the `programmes` array of programmes.json.
     * @param {any} programmes
     */
    constructor(programmes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.resolver_new(retptr, addHeapObject(programmes));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            ResolverFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * `{kind: "one"|"many"|"broad", codes, topic, via, levelMissing, total}` or `null`. `loose` = nearest names only.
     * @param {string} q
     * @param {boolean} loose
     * @returns {any}
     */
    resolve(q, loose) {
        const ptr0 = passStringToWasm0(q, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.resolver_resolve(this.__wbg_ptr, ptr0, len0, loose);
        return takeObject(ret);
    }
}
if (Symbol.dispose) Resolver.prototype[Symbol.dispose] = Resolver.prototype.free;

/**
 * The whole chat decision order (plan 009). Built from the page's manual rows and programme rows (or null when there is no
 * catalogue), then asked one question at a time. `decide` returns the route name or `null` (= the page's "not found" path).
 */
export class Router {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RouterFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_router_free(ptr, 0);
    }
    /**
     * `state`: `{progState, aiOff, pinnedId, programmeInFocus, today, agencyHasIt}`; `rewrite`: the AI's phrases (array) or null.
     * Returns the route name, or `null` for the page's "not found" path.
     * @param {string} q
     * @param {any} state
     * @param {any} rewrite
     * @returns {any}
     */
    decide(q, state, rewrite) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(q, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.router_decide(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(state), addHeapObject(rewrite));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Same arguments as `decide`. Returns `{route, personal, stuck: {key, picks, areas}, programme, aspect, timeIntent, studyIntent}`:
     * the route (or `null`) and what its view needs; fields a route does not use are `null` (plan 015 step 4c).
     * @param {string} q
     * @param {any} state
     * @param {any} rewrite
     * @returns {any}
     */
    decision(q, state, rewrite) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(q, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len0 = WASM_VECTOR_LEN;
            wasm.router_decision(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(state), addHeapObject(rewrite));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * `kb`: the manual rows (array); `programmes`: the programme rows (array) or null; `vocab`: a pack's vocab.json text, or omitted
     * for the embedded graduate-school pack (install happens once per process, before any route call).
     * @param {any} kb
     * @param {any} programmes
     * @param {string | null} [vocab]
     */
    constructor(kb, programmes, vocab) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            var ptr0 = isLikeNone(vocab) ? 0 : passStringToWasm0(vocab, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len0 = WASM_VECTOR_LEN;
            wasm.router_new(retptr, addHeapObject(kb), addHeapObject(programmes), ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            RouterFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) Router.prototype[Symbol.dispose] = Router.prototype.free;

/**
 * The manual's own words cut into short points (port of chatbot.html `answerPoints`).
 * @param {string} body
 * @returns {any}
 */
export function answer_points(body) {
    const ptr0 = passStringToWasm0(body, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.answer_points(ptr0, len0);
    return takeObject(ret);
}

/**
 * BLAKE3 of the UTF-8 bytes of `text`, as 64 hex chars. The page builds the answer receipt from it: the preimage (question, route, served
 * entry id + content, hash of the whole manual) is assembled in JS, hashed here, so one implementation hashes everything in the browser.
 * @param {string} text
 * @returns {string}
 */
export function blake3_text(text) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.blake3_text(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
}

/**
 * `{kind: "personal", category, label}` for a personal/technical issue that needs staff, else `null` (port of `classifyIssue`).
 * @param {string} text
 * @returns {any}
 */
export function classify_issue(text) {
    const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.classify_issue(ptr0, len0);
    return takeObject(ret);
}

/**
 * Classify a message as smalltalk. Returns the intent kind ("greet"/"thanks"/
 * "bye"/"whatcan"/"howareyou") or an empty string when it is NOT smalltalk
 * (a real question / complaint → kernel path). Sigmoid gate, argmax over gate.
 * @param {string} text
 * @returns {string}
 */
export function classify_smalltalk(text) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.classify_smalltalk(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
}

/**
 * What to do after the search: `{action: "act"|"disambiguate"|"escalate", stage: "reflex"|"rethink"}` (port of `decideTier`).
 * `gate` may be NaN when the kernel gave no gate score.
 * @param {number} gate
 * @param {Float64Array} scores
 * @returns {any}
 */
export function decide_tier(gate, scores) {
    const ptr0 = passArrayF64ToWasm0(scores, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decide_tier(gate, ptr0, len0);
    return takeObject(ret);
}

/**
 * Fee table of one programme as `{rows, notes}` (port of `_pFee`).
 * @param {string[]} lines
 * @returns {any}
 */
export function fee_table(lines) {
    const ptr0 = passArrayJsValueToWasm0(lines, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.fee_table(ptr0, len0);
    return takeObject(ret);
}

/**
 * Open-ended advice question (rephrase-worthy), not a factual lookup (port of `isAdvice`).
 * @param {string} q
 * @returns {boolean}
 */
export function is_advice(q) {
    const ptr0 = passStringToWasm0(q, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.is_advice(ptr0, len0);
    return ret !== 0;
}

/**
 * Latin letters and no Thai letters (port of `isEnglish`).
 * @param {string} q
 * @returns {boolean}
 */
export function is_english(q) {
    const ptr0 = passStringToWasm0(q, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.is_english(ptr0, len0);
    return ret !== 0;
}

/**
 * Search a KB (passed as `[{id, keywords}]` JSON) for `query`. Returns a ranked
 * `[{id, s, cos, overlap}]`. The KB is small (tens–hundreds of entries) so a
 * per-call IDF build is microseconds; no caching needed across the wasm boundary.
 * @param {any} kb
 * @param {string} query
 * @returns {any}
 */
export function kb_search(kb, query) {
    const ptr0 = passStringToWasm0(query, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.kb_search(addHeapObject(kb), ptr0, len0);
    return takeObject(ret);
}

/**
 * Route one task entirely in the browser. Returns a JSON object with the
 * decision + a reproducible BLAKE3 proof — no backend, no token cost on the
 * fast path. Mirrors the native Rust kernel's decision exactly.
 * @param {string} category
 * @param {string} input
 * @param {number} token_budget
 * @param {number} priority
 * @returns {any}
 */
export function route_task(category, input, token_budget, priority) {
    const ptr0 = passStringToWasm0(category, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(input, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.route_task(ptr0, len0, ptr1, len1, token_budget, priority);
    return takeObject(ret);
}

/**
 * Admission schedule of one programme as `{cols, rows, notes, list}` (port of `_pSchedule`, data part).
 * @param {string[]} lines
 * @returns {any}
 */
export function schedule_table(lines) {
    const ptr0 = passArrayJsValueToWasm0(lines, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.schedule_table(ptr0, len0);
    return takeObject(ret);
}

/**
 * The number a question asks for, taken from the answer (port of chatbot.html `slotLead`); "" when none.
 * @param {string} answer
 * @param {string} question
 * @returns {string}
 */
export function slot_lead(answer, question) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(answer, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(question, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        wasm.slot_lead(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred3_0 = r0;
        deferred3_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Verify the phrases an AI wrote: `results[i]` = the search result of `phrases[i]` as `[{id, s}]` (best first, 3 are enough).
 * Returns `{kind: "one", id, score, via, others}`, `{kind: "many", ids}` or `{kind: "none"}` (port of `understand`).
 * @param {string[]} phrases
 * @param {any} results
 * @returns {any}
 */
export function understand(phrases, results) {
    const ptr0 = passArrayJsValueToWasm0(phrases, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.understand(ptr0, len0, addHeapObject(results));
    return takeObject(ret);
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_960c155d3d49e4c2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg___wbindgen_boolean_get_6ea149f0a8dcc5ff: function(arg0) {
            const v = getObject(arg0);
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_ab4b34d23d6778bd: function(arg0, arg1) {
            const ret = debugString(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_a5d8b22e52b24dd1: function(arg0, arg1) {
            const ret = getObject(arg0) in getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_is_function_3baa9db1a987f47d: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_52ff4ec04186736f: function(arg0) {
            const ret = getObject(arg0) === null;
            return ret;
        },
        __wbg___wbindgen_is_object_63322ec0cd6ea4ef: function(arg0) {
            const val = getObject(arg0);
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_undefined_29a43b4d42920abd: function(arg0) {
            const ret = getObject(arg0) === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_cac3565e89b4134c: function(arg0, arg1) {
            const ret = getObject(arg0) == getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_number_get_c7f42aed0525c451: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_7ed5322991caaec5: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_6b64449b9b9ed33c: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_14b169f759b26747: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).call(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_done_9158f7cc8751ba32: function(arg0) {
            const ret = getObject(arg0).done;
            return ret;
        },
        __wbg_get_1affdbdd5573b16a: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_get_unchecked_17f53dad852b9588: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = getObject(arg0)[getObject(arg1)];
            return addHeapObject(ret);
        },
        __wbg_instanceof_ArrayBuffer_7c8433c6ed14ffe3: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_152ba1f289edcf3f: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_c3109d14ffc06469: function(arg0) {
            const ret = Array.isArray(getObject(arg0));
            return ret;
        },
        __wbg_iterator_013bc09ec998c2a7: function() {
            const ret = Symbol.iterator;
            return addHeapObject(ret);
        },
        __wbg_length_3d4ecd04bd8d22f1: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_length_9f1775224cf1d815: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_new_0c7403db6e782f19: function(arg0) {
            const ret = new Uint8Array(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_new_682678e2f47e32bc: function() {
            const ret = new Array();
            return addHeapObject(ret);
        },
        __wbg_new_aa8d0fa9762c29bd: function() {
            const ret = new Object();
            return addHeapObject(ret);
        },
        __wbg_next_0340c4ae324393c3: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).next();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_next_7646edaa39458ef7: function(arg0) {
            const ret = getObject(arg0).next;
            return addHeapObject(ret);
        },
        __wbg_prototypesetcall_a6b02eb00b0f4ce2: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
        },
        __wbg_set_3bf1de9fab0cd644: function(arg0, arg1, arg2) {
            getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
        },
        __wbg_value_ee3a06f4579184fa: function(arg0) {
            const ret = getObject(arg0).value;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000003: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return addHeapObject(ret);
        },
        __wbindgen_object_clone_ref: function(arg0) {
            const ret = getObject(arg0);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./reflex_wasm_bg.js": import0,
    };
}

const ResolverFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_resolver_free(ptr >>> 0, 1));
const RouterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_router_free(ptr >>> 0, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export3(addHeapObject(e));
    }
}

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    const mem = getDataViewMemory0();
    for (let i = 0; i < array.length; i++) {
        mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('reflex_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
