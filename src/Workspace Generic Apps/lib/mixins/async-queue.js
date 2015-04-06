/** this is pretty much like a mutex implementation. you call enqueue and then when its your function's turn
	you do stuff and then you call the callback passed to you so the next function can execute.
	
	IT WILL ALWAYS PERFORM YOUR QUEUED FUNCTION WRAPPED IN A setTimeout. 
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	//given named queues, only allows one function at a time in each queue to execute. 
	Ext.define('AsyncQueue', {
		
		QueueOfFuncs: {},
		
		_dequeue: function(queueName){
			var me=this;
			queueName = queueName || 'undefined'; //to be clear
			if(me.QueueOfFuncs[queueName]){
				me.QueueOfFuncs[queueName].shift();
				if(!me.QueueOfFuncs[queueName].length) return;
				else {
					setTimeout(function(){
						me.QueueOfFuncs[queueName][0].call(me, me._dequeue.bind(me, queueName));
					}, 0);
				}
			}
		},
		
		//callback(done)...make sure you call done when you are finished
		_enqueue: function(callback, queueName){
			var me=this;
			queueName = queueName || 'undefined'; //to be clear
			if(typeof callback !== 'function') throw 'ERROR: not a function';
			if(!me.QueueOfFuncs[queueName] || !me.QueueOfFuncs[queueName].length){
				me.QueueOfFuncs[queueName] = [callback];
				setTimeout(function(){
					callback.call(me, me._dequeue.bind(me, queueName));
				}, 0);
			}
			else me.QueueOfFuncs[queueName].push(callback);
		}
	});
}());