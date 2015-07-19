/** 
	given named queues, only allows one function at a time in each queue to execute. 
	
	This is just a locking implementation. you call enqueue and then when its your function's turn
	you do stuff and then you call the callback passed to you so the next function can execute.
	
	It will always perfom your queued function wrapped in a setTimeout. 
	
	Mix this in to your app: call me.enqueue(function(){...}, 'queue-name') 
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		QueueOfFuncs = {};
	
	function dequeue(queueName){
		queueName = queueName || 'undefined';
		if(QueueOfFuncs[queueName]){
			QueueOfFuncs[queueName].shift();
			if(!QueueOfFuncs[queueName].length) return;
			else {
				setTimeout(function(){
					QueueOfFuncs[queueName][0].call(null, dequeue.bind(null, queueName));
				}, 0);
			}
		}
	}
	
	Ext.define('Intel.lib.mixin.AsyncQueue', {
		/**
			input callback(done): make sure you call done when you are finished
			input queueName: name of queue to use, if not specified uses default
		*/
		enqueue: function(callback, queueName){
			queueName = queueName || 'undefined';
			if(typeof callback !== 'function') throw new Error('Not a function');
			if(!QueueOfFuncs[queueName] || !QueueOfFuncs[queueName].length){
				QueueOfFuncs[queueName] = [callback];
				setTimeout(function(){
					callback.call(null, dequeue.bind(null, queueName));
				}, 0);
			}
			else QueueOfFuncs[queueName].push(callback);
		}
	});
}());