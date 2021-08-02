exports.handler = async(event, context, callback) => {
    const output = event.records.map((record) => {
        const data = Buffer.from(record.data, 'base64').toString('utf8');
        const payload = JSON.parse(data);
        var updatedPayload = {};
        var index = 0;
        payload.forEach((r) => {
            // Interested in capturing just the function logs
            if(r.type === "function"){
                updatedPayload["logEvent_"+(++index)] = r;
            }            
        });        
        const encodedData = (Buffer.from(JSON.stringify(updatedPayload))).toString('base64');
        return {
            recordId: record.recordId,
            result: 'Ok',
            data: encodedData
        };
    });

    callback(null, { records: output });
};
