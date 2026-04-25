#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NativeFiles, "NativeFiles",
    CAP_PLUGIN_METHOD(pickBoardFile, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(saveBoardFile, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(selectFolder, CAPPluginReturnPromise);
)