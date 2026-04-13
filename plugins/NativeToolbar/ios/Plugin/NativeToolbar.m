#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NativeToolbar, "NativeToolbar",
    CAP_PLUGIN_METHOD(setTitle, CAPPluginReturnPromise);
)