// -- Object registry ----------------------------------------------------------

const wecl_object_from_id = new Map();
const wecl_id_from_object = new Map();
var wecl_next_id = 1;           // skip NULL

class cl_object_ref {
    constructor() {
        id = wecl_ensure_object(this);
        // console.log("Created a new object with id " + id);
        this.id = id;
    }

    toString() {
        return "[" + this.id + " LispObjectRef" + "]";
    }
}

function wecl_ensure_object (object) {
    id = wecl_id_from_object.get(object);
    if (id != null) return id;
    wecl_id_from_object.set(object, wecl_next_id);
    wecl_object_from_id.set(wecl_next_id, object);
    return wecl_next_id++;
}

function wecl_search_object (id) {
    return wecl_object_from_id.get(id);
}

function wecl_delete_object (id) {
    object = wecl_object_from_id.get(id);
    if (object == null) return false;
    wecl_id_from_object.delete(object);
    wecl_object_from_id.delete(id);
    return true;
}

// -- Evaluator ----------------------------------------------------------------

/* I want to create here a function that takes strings from CL and evaluates
 * them. This is to prevent syntax errors from crashing CL. See #j (...) # */

var wecl_eval = null;
var wecl_call = null;
var wecl_test = null;

function wecl_lcall(fun, ...args) {
    f = wecl_ensure_object(fun);
    v = "(";
    args.forEach(arg => v += wecl_ensure_object(arg) + " ");
    v += ")";
    // console.log("calling " + fun + " " + args + " -> " + f + " " + v);
    id = wecl_call(f, v);
    obj = wecl_search_object(id);
    // console.log("result is " + obj + " id " + id);
    return obj;
}

function wecl_lprep(fun) {
    return ((...args) => wecl_lcall(fun, ...args));
}

function wecl_test_function(arg) {
    console.log('Example function received ' + arg);
    return arg+1;
}

class wecl_test_class {
    example_method(arg1, arg2) {
        console.log('Example method received ' + arg1 + ', ' + arg2);
        return arg1;
    }
}

var wecl_test_object = new wecl_test_class();

// -- WASM ---------------------------------------------------------------------

var Module = {};
var wecl_init_hooks = [];

Module['onRuntimeInitialized'] = function() {
    console.log("Module runtime initialized successfully.");
    wecl_init = Module.cwrap('wecl_boot', null, [], {async:true});
    wecl_eval = Module.cwrap('wecl_eval', null, ['string'], {async:true});
    wecl_call = Module.cwrap('wecl_call', 'number', ['number', 'string'], {async:true});
    // These are usually executed asynchronously.
    console.log("Booting Web Embeddable Common Lisp...");
    wecl_init();
    console.log("Running user initialization hooks.");
    wecl_init_hooks.map((x) => x());
    console.log("Happy hacking!");
};
