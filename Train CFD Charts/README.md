Train CFD Chart README
======================

note the rally lookback feature that prevents you from actually pulling lookback data for a train directly (Forbidden 403 error)

Explanation: Rally 2.0 decided that the lookback API should return an error if you don't have access to one of the projects or snapshots
being requested, which makes it really hard to get the CFD chart for a trian, because if it has closed projects underneath it, you cannot scope down in the query, you have to load each of its valid children projects one by one and then aggregate all their snapshots 
together
