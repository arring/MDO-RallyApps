//given named queues, only allows one function at a time in each queue to execute. 
Ext.define('AsyncQueue', {
	
	QueueOfFuncs: {},
	
	_dequeue: function(queueName){
		var me=this;
		queueName = queueName || 'undefined'; //to be clear
		if(me.QueueOfFuncs[queueName]){
			me.QueueOfFuncs[queueName].shift();
			if(!me.QueueOfFuncs[queueName].length) return;
			else me.QueueOfFuncs[queueName][0].call(me, me._dequeue.bind(me, queueName));
		}
	},
	
	//callback(done)...make sure you call done when you are finished
	_enqueue: function(callback, queueName){
		var me=this;
		queueName = queueName || 'undefined'; //to be clear
		if(typeof callback !== 'function') return console.log('ERR: not a function', callback);
		if(!me.QueueOfFuncs[queueName] || !me.QueueOfFuncs[queueName].length){
			me.QueueOfFuncs[queueName] = [callback];
			callback.call(me, me._dequeue.bind(me, queueName));
		}
		else me.QueueOfFuncs[queueName].push(callback);
	}
});