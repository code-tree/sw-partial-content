'use strict'
/* globals self,caches,Headers,Response */


self.addEventListener('install', function(event){
    event.waitUntil(
        caches.open('test').then(function(cache){
            // NOTE: Only caching audio as offline support not necessary for test
            return cache.addAll(['audio.mp3'])
        }).then(function(){
            return self.skipWaiting()
        })
    )
})


self.addEventListener('activate', function(event){
    event.waitUntil(self.clients.claim().then(function(){
        console.log('SW activated')
    }))
})


self.addEventListener('fetch', function(event){
    // Just fetch for non-audio
    if (event.request.url.indexOf('audio.mp3') === -1)
        event.respondWith(fetch(event.request))
    // Return cached audio
    event.respondWith(
        caches.match('audio.mp3').then(function(response){
            if (event.request.url.endsWith('?ranged')){
                console.log('Audio: Returning ranged response')
                return rangeable_resp(event.request, response)
            }
            console.log('Audio: Returning regular response')
            return response
        })
    )
})


function rangeable_resp(request, resp){
    // Return the response, obeying the range header if given
    // NOTE: Does not support 'if-range' or multiple ranges!
    // TODO: Temporary implementation, waiting on official fix:
    // https://github.com/whatwg/fetch/issues/144
    // https://github.com/slightlyoff/ServiceWorker/issues/703
    
    // Validate range value (return whole resp if null or invalid)
    let range = /^bytes\=(\d*)\-(\d*)$/gi.exec(request.headers.get('range'))
    if (range === null || (range[1] === '' && range[2] === ''))
        return resp
    
    // Get the body as an array buffer
    return resp.arrayBuffer().then(function(ab){
        let total = ab.byteLength
        let start = Number(range[1])
        let end = Number(range[2])
        // Handle no start value (end is therefore an _offset_ from real end)
        // NOTE: testing on range var, as start/end Number('') -> 0
        if (range[1] === ''){
            start = total - end
            end = total - 1
        }
        // Handle no end value
        if (range[2] === ''){
            end = total - 1
        }
        // Handle invalid values
        if (start > end || end >= total || start < 0)
            return resp  // Ignore whole range (NOTE: may not follow spec here)
        // Add range headers to response's headers
        let headers = new Headers()
        for (let [k, v] of resp.headers)
            headers.set(k, v)
        headers.set('Content-Range', `bytes ${start}-${end}/${total}`)
        headers.set('Content-Length', end - start + 1)
        // Return ranged response
        return new Response(ab.slice(start, end + 1), {
            'status': 206,
            'statusText': 'Partial Content',
            'headers': headers,
        })
    })
}
