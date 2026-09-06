/** Keep at most the currently queued SSE packet in the Node write buffer.
 * A slow connection resumes from a freshly generated world state; obsolete
 * intermediate snapshots are never generated or retained in an application queue.
 */
export function createWorldStream(response, after=0) {
  let cursor=after;
  let blockedAt=null;
  let closed=false;
  const drain=()=>{blockedAt=null;};
  const close=()=>{closed=true;response.off('drain',drain);response.off('close',close);};
  response.on('drain',drain);
  response.on('close',close);
  return {
    get after(){return cursor;},
    flush(snapshotFor, sequence, now) {
      if(closed||response.destroyed||response.writableEnded)return false;
      if(blockedAt!==null){
        // A disconnected peer can leave its TCP connection half open. Give a
        // slow receiver 30 seconds to drain before releasing that connection.
        if(now-blockedAt>=30_000)response.destroy();
        return false;
      }
      const packet=`data: ${JSON.stringify(snapshotFor(cursor))}\n\n`;
      const ready=response.write(packet);
      // false still means the bytes were accepted by Node. Retrying this packet
      // after drain would duplicate events; only subsequent events are requested.
      cursor=sequence;
      if(!ready)blockedAt=now;
      return true;
    },
  };
}
